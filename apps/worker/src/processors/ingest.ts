import { prisma } from '@qa/db';
import { hasRingCxCreds } from '@qa/shared';
import { RingCxClient, type RcSegment } from '@qa/ringcx';
import { enqueueTranscribe, type IngestPollJob } from '@qa/pipeline';
import { config } from '../env';
import { putRecording } from '../storage';

const LOOKBACK_MINUTES = 30; // window scanned each poll (before the lag)
const MAX_DOWNLOADS_PER_POLL = 20; // protect against RingCX recording rate limits

function client(): RingCxClient {
  return new RingCxClient({
    serverUrl: config.RC_SERVER_URL,
    engageUrl: config.RC_ENGAGE_URL,
    clientId: config.RC_CLIENT_ID!,
    clientSecret: config.RC_CLIENT_SECRET!,
    jwt: config.RC_JWT!,
    accountId: config.RC_ACCOUNT_ID!,
    subAccountId: config.RC_SUBACCOUNT_ID!,
  });
}

async function upsertAgent(seg: RcSegment): Promise<string | null> {
  if (!seg.agentId) return null;
  const agent = await prisma.agent.upsert({
    where: { rcAgentId: seg.agentId },
    create: {
      rcAgentId: seg.agentId,
      username: seg.agentUsername ?? seg.agentId,
      name: seg.agentName ?? seg.agentUsername ?? seg.agentId,
    },
    update: {
      ...(seg.agentName ? { name: seg.agentName } : {}),
      ...(seg.agentUsername ? { username: seg.agentUsername } : {}),
    },
  });
  return agent.id;
}

/** Pull one recording → storage → enqueue transcription. Returns true on success. */
async function fetchRecordingAndQueue(
  rc: RingCxClient,
  interaction: { id: string; dialogId: string; segmentId: string },
): Promise<boolean> {
  try {
    const bytes = await rc.downloadRecording(interaction.dialogId, interaction.segmentId);
    const key = `rec/${interaction.dialogId}/${interaction.segmentId}.wav`;
    await putRecording(key, bytes);
    await prisma.interaction.update({ where: { id: interaction.id }, data: { recordingKey: key, statusError: null } });
    await enqueueTranscribe({ interactionId: interaction.id });
    return true;
  } catch (err) {
    console.error(`[ingest] recording download failed for ${interaction.dialogId}/${interaction.segmentId}:`, err);
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { statusError: String(err) },
    });
    return false;
  }
}

export async function runIngestPoll(job: IngestPollJob): Promise<{ scanned: number; created: number }> {
  if (!hasRingCxCreds(config)) {
    console.warn('[ingest] RingCX credentials not configured — skipping poll.');
    return { scanned: 0, created: 0 };
  }

  const rc = client();
  let budget = MAX_DOWNLOADS_PER_POLL;

  // 1) Drain any sampled calls still missing a recording (self-healing backlog).
  const backlog = await prisma.interaction.findMany({
    where: { sampled: true, recordingKey: null, status: 'INGESTED' },
    orderBy: { startedAt: 'asc' },
    take: budget,
    select: { id: true, dialogId: true, segmentId: true },
  });
  for (const it of backlog) {
    if (budget <= 0) break;
    if (await fetchRecordingAndQueue(rc, it)) budget--;
  }

  // 2) Scan the metadata window for new calls.
  const now = Date.now();
  const end = job.windowEndISO ? new Date(job.windowEndISO) : new Date(now - config.RC_INGEST_LAG_MINUTES * 60_000);
  const start = job.windowStartISO
    ? new Date(job.windowStartISO)
    : new Date(end.getTime() - LOOKBACK_MINUTES * 60_000);

  const segments = await rc.getInteractionMetadata(start, end);
  console.log(`[ingest] window ${start.toISOString()}..${end.toISOString()} → ${segments.length} segments`);

  let created = 0;
  for (const seg of segments) {
    const existing = await prisma.interaction.findUnique({
      where: { dialogId_segmentId: { dialogId: seg.dialogId, segmentId: seg.segmentId } },
    });
    if (existing) continue; // idempotent — never re-ingest

    const agentId = await upsertAgent(seg);
    const sampled = Math.random() * 100 < config.QA_SAMPLE_PERCENT;

    const interaction = await prisma.interaction.create({
      data: {
        dialogId: seg.dialogId,
        segmentId: seg.segmentId,
        agentId,
        queue: seg.queue,
        direction: seg.direction,
        ani: seg.ani,
        dnis: seg.dnis,
        startedAt: new Date(seg.startedAt),
        durationSec: seg.durationSec,
        sampled,
        status: 'INGESTED',
      },
    });
    created++;

    // Sampled + budget remaining → pull now; otherwise the backlog pass catches it next poll.
    if (sampled && budget > 0) {
      if (await fetchRecordingAndQueue(rc, interaction)) budget--;
    }
  }

  console.log(`[ingest] created ${created} interactions; download budget left ${budget}.`);
  return { scanned: segments.length, created };
}
