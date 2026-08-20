import { Router } from 'express';
import multer from 'multer';
import { BulkManualInput, CALL_DIRECTIONS, InteractionQuery, ManualInteractionInput } from '@qa/shared';
import { prisma, type Prisma } from '@qa/db';
import { AssemblyAIClient, mapSpeakers, utterancesToText } from '@qa/transcribe';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { interactionScopeWhere } from '../lib/scope';
import { presignRecordingUrl } from '../lib/storage';
import { runScoringForInteraction } from '../lib/scoring-run';
import { createRecordingUpload, supabaseConfigured } from '../lib/supabase-storage';
import { config } from '../env';
import { audit } from '../lib/audit';

export const interactionsRouter = Router();
interactionsRouter.use(authenticate);

// Memory storage (no disk writes) — the file is relayed straight through to
// AssemblyAI's own upload endpoint, never stored by us. Kept small: Vercel's
// serverless request body cap is ~4.5MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4_000_000 } });

// GET /interactions — filtered, paginated list scoped to the user's role.
interactionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = InteractionQuery.parse(req.query);
    const where: Prisma.InteractionWhereInput = { AND: [interactionScopeWhere(req.user!)] };
    const and = where.AND as Prisma.InteractionWhereInput[];

    if (q.status) and.push({ status: q.status as Prisma.InteractionWhereInput['status'] });
    if (q.agentId) and.push({ agentId: q.agentId });
    if (q.teamId) and.push({ agent: { teamId: q.teamId } });
    if (q.queue) and.push({ queue: q.queue });
    if (q.verdict) and.push({ evaluations: { some: { finalVerdict: q.verdict as 'PASS' | 'FAIL' } } });
    if (q.from || q.to) {
      and.push({
        startedAt: {
          ...(q.from ? { gte: new Date(q.from) } : {}),
          ...(q.to ? { lte: new Date(q.to) } : {}),
        },
      });
    }

    const [total, rows] = await Promise.all([
      prisma.interaction.count({ where }),
      prisma.interaction.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          agent: { select: { id: true, name: true, teamId: true } },
          evaluations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, finalVerdict: true, finalScore: true, reviewed: true, autoFailTriggered: true },
          },
        },
      }),
    ]);

    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        dialogId: r.dialogId,
        segmentId: r.segmentId,
        agent: r.agent,
        queue: r.queue,
        direction: r.direction,
        startedAt: r.startedAt,
        durationSec: r.durationSec,
        sampled: r.sampled,
        manual: r.manual,
        status: r.status,
        statusError: r.statusError,
        evaluation: r.evaluations[0] ?? null,
      })),
    });
  }),
);

async function createManualInteraction(params: {
  recordingKey: string;
  agentId?: string;
  queue?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  agentDisposition?: string;
  startedAt?: string;
  durationSec?: number;
}) {
  return prisma.interaction.create({
    data: {
      dialogId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      segmentId: 'manual',
      agentId: params.agentId ?? null,
      queue: params.queue ?? null,
      direction: params.direction,
      agentDisposition: params.agentDisposition ?? null,
      startedAt: params.startedAt ? new Date(params.startedAt) : new Date(),
      durationSec: params.durationSec ?? 0,
      recordingKey: params.recordingKey,
      sampled: true,
      manual: true,
      status: 'INGESTED',
    },
  });
}

// POST /interactions/manual — add a call by pasting a recording link. Creates
// the row only; POST /:id/advance drives it through transcribe → score.
interactionsRouter.post(
  '/manual',
  requirePermission('interaction:create'),
  asyncHandler(async (req, res) => {
    const input = ManualInteractionInput.parse(req.body);
    const interaction = await createManualInteraction({ ...input, recordingKey: input.recordingUrl });
    await audit({ actorId: req.user!.id, action: 'interaction.manual_create', entity: 'Interaction', entityId: interaction.id });
    res.status(201).json(interaction);
  }),
);

// POST /interactions/manual/bulk — add many calls at once from a list of
// recording links (each already uploaded to Storage or a public URL). Creates
// INGESTED rows only; each is driven through transcribe→score via /advance.
interactionsRouter.post(
  '/manual/bulk',
  requirePermission('interaction:create'),
  asyncHandler(async (req, res) => {
    const { recordings } = BulkManualInput.parse(req.body);
    const ids: string[] = [];
    for (const rec of recordings) {
      const interaction = await createManualInteraction({ ...rec, recordingKey: rec.recordingUrl });
      ids.push(interaction.id);
    }
    await audit({ actorId: req.user!.id, action: 'interaction.manual_bulk', entity: 'Interaction', metadata: { count: ids.length } });
    res.status(201).json({ created: ids.length, ids });
  }),
);

// POST /interactions/recordings/sign — get a signed URL to upload a recording
// DIRECTLY to Supabase Storage (browser → Storage), bypassing the API's ~4.5MB
// request limit. The returned publicUrl is then passed to POST /manual.
interactionsRouter.post(
  '/recordings/sign',
  requirePermission('interaction:create'),
  asyncHandler(async (req, res) => {
    if (!supabaseConfigured()) {
      throw badRequest('Large uploads are not configured yet (Supabase Storage keys are missing).');
    }
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : 'recording.mp3';
    const signed = await createRecordingUpload(filename);
    res.json(signed);
  }),
);

// POST /interactions/manual/upload — add a call by uploading a file directly.
// The file is relayed straight to AssemblyAI's upload endpoint (no S3/storage
// setup needed) and its hosted URL becomes the recording link, same as if it
// had been pasted — the rest of the transcribe/score flow is identical.
interactionsRouter.post(
  '/manual/upload',
  requirePermission('interaction:create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded (field name must be "file")');
    if (!config.ASSEMBLYAI_API_KEY) {
      throw badRequest('Uploads require transcription to be configured (ASSEMBLYAI_API_KEY is not set)');
    }
    const direction = CALL_DIRECTIONS.includes(req.body.direction) ? req.body.direction : 'OUTBOUND';

    const aai = new AssemblyAIClient(config.ASSEMBLYAI_API_KEY);
    const hostedUrl = await aai.upload(req.file.buffer);

    const interaction = await createManualInteraction({
      recordingKey: hostedUrl,
      agentId: req.body.agentId || undefined,
      queue: req.body.queue || undefined,
      direction,
    });
    await audit({ actorId: req.user!.id, action: 'interaction.manual_upload', entity: 'Interaction', entityId: interaction.id });
    res.status(201).json(interaction);
  }),
);

// GET /interactions/:id — full detail incl. transcript + latest evaluation.
interactionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const scope = interactionScopeWhere(req.user!);
    const interaction = await prisma.interaction.findFirst({
      where: { AND: [{ id: req.params.id }, scope] },
      include: {
        agent: { select: { id: true, name: true, teamId: true, username: true } },
        transcript: true,
        evaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            scorecard: { include: { criteria: { orderBy: { order: 'asc' } } } },
            criterionResults: true,
            disputes: { orderBy: { createdAt: 'desc' } },
            reviews: {
              orderBy: { createdAt: 'desc' },
              include: { reviewer: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    if (!interaction) throw notFound('Interaction not found');

    const recordingUrl = interaction.recordingKey
      ? await presignRecordingUrl(interaction.recordingKey)
      : null;

    res.json({ ...interaction, recordingUrl, evaluation: interaction.evaluations[0] ?? null });
  }),
);

// POST /interactions/:id/advance — move a manually-added call one step
// forward: INGESTED → (submit) TRANSCRIBING → (poll) TRANSCRIBED → (score) SCORED.
// Idempotent and resumable: safe to call repeatedly (the client polls this),
// and safe to retry later once a missing API key is configured.
interactionsRouter.post(
  '/:id/advance',
  requirePermission('interaction:create'),
  asyncHandler(async (req, res) => {
    const scope = interactionScopeWhere(req.user!);
    const interaction = await prisma.interaction.findFirst({
      where: { AND: [{ id: req.params.id! }, scope] },
      include: { transcript: true },
    });
    if (!interaction) throw notFound('Interaction not found');

    // A FAILED call is retryable: resume from whichever step it actually
    // reached (a transient network error shouldn't dead-end the call).
    let effectiveStatus = interaction.status;
    if (effectiveStatus === 'FAILED') {
      effectiveStatus = !interaction.transcript
        ? 'INGESTED'
        : !interaction.transcript.fullText
          ? 'TRANSCRIBING'
          : 'TRANSCRIBED';
    }

    // Step 1: not yet submitted to AssemblyAI.
    if (effectiveStatus === 'INGESTED' && !interaction.transcript) {
      if (!interaction.recordingKey) throw badRequest('This call has no recording link to transcribe');
      if (!config.ASSEMBLYAI_API_KEY) {
        return res.json({ status: 'INGESTED', statusError: 'ASSEMBLYAI_API_KEY not configured' });
      }
      try {
        const aai = new AssemblyAIClient(config.ASSEMBLYAI_API_KEY);
        const providerRef = await aai.submitUrl(interaction.recordingKey, { redactPii: true });
        await prisma.transcript.create({
          data: { interactionId: interaction.id, provider: 'assemblyai', providerRef, fullText: '', utterances: [], redactionApplied: true },
        });
        await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'TRANSCRIBING', statusError: null } });
        return res.json({ status: 'TRANSCRIBING' });
      } catch (err) {
        await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'FAILED', statusError: String(err) } });
        return res.json({ status: 'FAILED', statusError: String(err) });
      }
    }

    // Step 2: waiting on AssemblyAI.
    if (effectiveStatus === 'TRANSCRIBING' && interaction.transcript?.providerRef) {
      if (!config.ASSEMBLYAI_API_KEY) {
        return res.json({ status: 'TRANSCRIBING', statusError: 'ASSEMBLYAI_API_KEY not configured' });
      }
      try {
        const aai = new AssemblyAIClient(config.ASSEMBLYAI_API_KEY);
        const t = await aai.getStatus(interaction.transcript.providerRef);
        if (t.status === 'error') {
          await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'FAILED', statusError: t.error ?? 'AssemblyAI transcription error' } });
          return res.json({ status: 'FAILED', statusError: t.error });
        }
        if (t.status !== 'completed') {
          return res.json({ status: 'TRANSCRIBING' }); // still processing — client will poll again
        }
        const utterances = mapSpeakers(t.utterances ?? [], interaction.direction);
        await prisma.transcript.update({
          where: { interactionId: interaction.id },
          data: { fullText: t.text ?? utterancesToText(utterances), utterances: utterances as unknown as Prisma.InputJsonValue, redactionApplied: true },
        });
        await prisma.interaction.update({
          where: { id: interaction.id },
          data: {
            status: 'TRANSCRIBED',
            statusError: null,
            ...(interaction.durationSec === 0 && t.audioDurationSec ? { durationSec: Math.round(t.audioDurationSec) } : {}),
          },
        });
        return res.json({ status: 'TRANSCRIBED' });
      } catch (err) {
        await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'FAILED', statusError: String(err) } });
        return res.json({ status: 'FAILED', statusError: String(err) });
      }
    }

    // Step 3: transcript ready, needs scoring.
    if (effectiveStatus === 'TRANSCRIBED') {
      if (!config.ANTHROPIC_API_KEY) {
        return res.json({ status: 'TRANSCRIBED', statusError: 'ANTHROPIC_API_KEY not configured' });
      }
      try {
        const result = await runScoringForInteraction(interaction.id);
        return res.json({ status: 'SCORED', verdict: result.verdict });
      } catch (err) {
        return res.json({ status: 'FAILED', statusError: String(err) });
      }
    }

    // Terminal or unrelated state — nothing to advance.
    res.json({ status: interaction.status, statusError: interaction.statusError });
  }),
);
