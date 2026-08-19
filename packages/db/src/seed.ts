import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// Load the repo-root .env regardless of the process cwd.
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../.env') });

import bcrypt from 'bcryptjs';
import { computeVerdict, type CriterionVerdict, type ScoreConfig } from '@qa/shared';
import { prisma } from './index';
import { IHG_HICV_SCORECARD } from './ihg-scorecard';

/**
 * Seeds a fully clickable demo: users for every role, teams, agents, an example
 * QA scorecard (stand-in until the company's real guidelines arrive), and a
 * batch of interactions with transcripts + AI evaluations across a date range.
 *
 * Safe to re-run: wipes app data first. NEVER run against production.
 */

const PASSWORD = 'password123'; // demo only

const SCORE_CONFIG: ScoreConfig = {
  mode: IHG_HICV_SCORECARD.scoringMode,
  passThreshold: IHG_HICV_SCORECARD.passThreshold,
  startingScore: IHG_HICV_SCORECARD.startingScore,
};

const QUEUES = ['IHG Survey - East', 'IHG Survey - West', 'IHG Survey - Central'];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function makeTranscript(agentName: string, verdictBias: 'good' | 'bad') {
  // Demo IHG member survey → Holiday Inn Club Vacations transfer.
  const utterances =
    verdictBias === 'good'
      ? [
          { speaker: 'AGENT', startMs: 0, endMs: 3500, text: `Hello, may I speak with Mr. Jordan Lee? My name is ${agentName}, calling on behalf of IHG.` },
          { speaker: 'CUSTOMER', startMs: 3700, endMs: 5200, text: 'Yes, this is Jordan.' },
          { speaker: 'AGENT', startMs: 5400, endMs: 13000, text: 'As a loyal IHG member, we’d love your feedback on a short 5-question survey. As an IHG member it’s also an opportunity to receive a special vacation offer as well as 500 IHG One Rewards points. May I have your permission to begin?' },
          { speaker: 'CUSTOMER', startMs: 13200, endMs: 14500, text: 'Sure, go ahead.' },
          { speaker: 'AGENT', startMs: 14700, endMs: 20000, text: 'Thank you. First, on a scale of 1 to 5, how satisfied were you with your most recent stay?' },
          { speaker: 'CUSTOMER', startMs: 20200, endMs: 21500, text: 'I’d say a 4.' },
          { speaker: 'AGENT', startMs: 21700, endMs: 30000, text: 'Thank you. Please hold for a few moments while I am connecting you to Holiday Inn Club Vacations to hear the special vacation offer, and for listening you will receive 500 IHG One Rewards points.' },
        ]
      : [
          { speaker: 'AGENT', startMs: 0, endMs: 6000, text: `Uh, hi, yeah is this the account holder? So I’m calling from IHG about a survey.` },
          { speaker: 'CUSTOMER', startMs: 6200, endMs: 7500, text: 'Who is this?' },
          { speaker: 'AGENT', startMs: 7700, endMs: 15000, text: 'So you’ll get 500 points, it’ll just take a minute. Let me put you through to Holiday Inn now.' },
          { speaker: 'CUSTOMER', startMs: 15200, endMs: 16500, text: 'Wait, I—' },
          { speaker: 'AGENT', startMs: 16700, endMs: 19000, text: 'Please hold, transferring you now.' },
        ];
  const fullText = utterances.map((u) => `${u.speaker}: ${u.text}`).join('\n');
  return { utterances, fullText };
}

async function main() {
  console.log('Seeding database...');

  // SAFETY GUARD — this seed is DESTRUCTIVE: it wipes every table below to
  // reset demo data. Once the app holds real, manually-added calls, a re-seed
  // would silently destroy them (this exact bug already lost a real recording
  // once). Refuse to run whenever the database already contains manual/real
  // interactions, unless the operator explicitly forces it with SEED_FORCE=1.
  const realCalls = await prisma.interaction.count({ where: { manual: true } });
  if (realCalls > 0 && process.env.SEED_FORCE !== '1') {
    console.error(
      `\n✋ Refusing to seed: the database contains ${realCalls} manually-added (real) call(s) ` +
        `that this destructive seed would delete.\n` +
        `   Recordings in Storage are untouched, but the call rows, transcripts and scores would be lost.\n` +
        `   To wipe EVERYTHING and reset demo data anyway, re-run with:  SEED_FORCE=1\n`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  // Wipe in FK-safe order.
  await prisma.auditLog.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.review.deleteMany();
  await prisma.criterionResult.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.criterion.deleteMany();
  await prisma.scorecard.deleteMany();
  // Break the User <-> Agent / Team cycles before deleting.
  await prisma.user.updateMany({ data: { teamId: null, agentId: null } });
  await prisma.team.updateMany({ data: { leadId: null } });
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Teams
  const teamAlpha = await prisma.team.create({ data: { name: 'Team Alpha' } });
  const teamBravo = await prisma.team.create({ data: { name: 'Team Bravo' } });

  // Agents (RingCX-style)
  const agentDefs = [
    { rcAgentId: 'rc-1001', username: 'j.rivera', name: 'Jamie Rivera', teamId: teamAlpha.id },
    { rcAgentId: 'rc-1002', username: 's.patel', name: 'Sam Patel', teamId: teamAlpha.id },
    { rcAgentId: 'rc-1003', username: 'a.okoro', name: 'Ada Okoro', teamId: teamAlpha.id },
    { rcAgentId: 'rc-2001', username: 'm.chen', name: 'Morgan Chen', teamId: teamBravo.id },
    { rcAgentId: 'rc-2002', username: 'l.gomez', name: 'Luca Gomez', teamId: teamBravo.id },
  ];
  const agents = [];
  for (const a of agentDefs) agents.push(await prisma.agent.create({ data: a }));

  // Users for each role
  const admin = await prisma.user.create({
    data: { email: 'admin@sublogical.com', name: 'Alex Khalid', role: 'ADMIN', passwordHash },
  });
  await prisma.user.create({
    data: { email: 'manager@sublogical.com', name: 'Quinn Morgan', role: 'QA_MANAGER', passwordHash },
  });
  await prisma.user.create({
    data: { email: 'analyst@sublogical.com', name: 'Riley Stone', role: 'QA_ANALYST', passwordHash },
  });
  const lead = await prisma.user.create({
    data: { email: 'lead@sublogical.com', name: 'Casey Ford', role: 'TEAM_LEAD', passwordHash, teamId: teamAlpha.id },
  });
  await prisma.team.update({ where: { id: teamAlpha.id }, data: { leadId: lead.id } });
  // Agent user linked to a RingCX agent
  await prisma.user.create({
    data: {
      email: 'agent@sublogical.com',
      name: agents[0]!.name,
      role: 'AGENT',
      passwordHash,
      teamId: teamAlpha.id,
      agentId: agents[0]!.id,
    },
  });

  // Scorecard — the real IHG / HICV survey QA rubric.
  const scorecard = await prisma.scorecard.create({
    data: {
      name: IHG_HICV_SCORECARD.name,
      description: IHG_HICV_SCORECARD.description,
      scoringMode: IHG_HICV_SCORECARD.scoringMode,
      startingScore: IHG_HICV_SCORECARD.startingScore,
      passThreshold: IHG_HICV_SCORECARD.passThreshold,
      referenceScript: IHG_HICV_SCORECARD.referenceScript,
      dispositionRules: IHG_HICV_SCORECARD.dispositionRules,
      createdBy: admin.id,
      criteria: {
        create: IHG_HICV_SCORECARD.criteria.map((c, i) => ({
          code: c.code,
          title: c.title,
          guidance: c.guidance,
          category: c.category,
          deduction: c.deduction,
          autoFail: c.autoFail,
          weight: 1,
          order: i,
        })),
      },
    },
    include: { criteria: true },
  });

  // Interactions + transcripts + evaluations
  const NUM = 40;
  let sampledCount = 0;
  for (let i = 0; i < NUM; i++) {
    const agent = pick(agents);
    const startedAt = daysAgo(Math.floor(Math.random() * 30));
    const sampled = Math.random() < 0.6; // ~60% sampled in the demo
    const direction = 'OUTBOUND'; // survey calls are outbound
    const bias: 'good' | 'bad' = Math.random() < 0.8 ? 'good' : 'bad';
    const reviewed = sampled && Math.random() < 0.4; // ~40% already reviewed
    // Good calls = correct "Successful Transfer"; bad calls sometimes record the wrong disposition.
    const agentDisposition = bias === 'good' ? 'Successful Transfer' : pick(['Successful Transfer', 'Attempt', 'Failed Transfer']);

    const interaction = await prisma.interaction.create({
      data: {
        dialogId: `dlg-${1000 + i}`,
        segmentId: `seg-${i}`,
        agentId: agent.id,
        queue: pick(QUEUES),
        direction,
        ani: `+1206555${String(1000 + i).padStart(4, '0')}`,
        dnis: '+18005551234',
        startedAt,
        durationSec: 120 + Math.floor(Math.random() * 480),
        sampled,
        agentDisposition,
        status: sampled ? (reviewed ? 'REVIEWED' : 'SCORED') : 'INGESTED',
        recordingKey: `demo/rec-${1000 + i}.wav`,
      },
    });

    if (!sampled) continue;
    sampledCount++;

    const { utterances, fullText } = makeTranscript(agent.name.split(' ')[0]!, bias);
    await prisma.transcript.create({
      data: {
        interactionId: interaction.id,
        provider: 'demo',
        fullText,
        utterances,
        redactionApplied: true,
      },
    });

    // Generate per-criterion verdicts. Criteria are MISTAKES:
    //   PASS = compliant (no mistake), FAIL = mistake committed.
    // Good calls are mostly compliant; bad calls commit several mistakes and
    // sometimes a fatal one.
    const results = scorecard.criteria.map((c) => {
      let verdict: CriterionVerdict;
      if (bias === 'good') {
        // Good calls never commit a fatal mistake; only a rare minor slip.
        verdict = c.autoFail ? 'PASS' : Math.random() < 0.01 ? 'FAIL' : 'PASS';
      } else if (c.autoFail) {
        verdict = Math.random() < 0.1 ? 'FAIL' : 'PASS';
      } else {
        verdict = Math.random() < 0.08 ? 'FAIL' : 'PASS';
      }
      return { criterion: c, verdict };
    });

    const { verdict, score, points, autoFailTriggered } = computeVerdict(
      results.map((r) => ({
        weight: r.criterion.weight,
        deduction: r.criterion.deduction,
        autoFail: r.criterion.autoFail,
        verdict: r.verdict,
      })),
      SCORE_CONFIG,
    );

    const mistakes = results.filter((r) => r.verdict === 'FAIL');
    await prisma.evaluation.create({
      data: {
        interactionId: interaction.id,
        scorecardId: scorecard.id,
        aiVerdict: verdict,
        aiScore: score,
        finalVerdict: verdict,
        finalScore: score,
        autoFailTriggered,
        reviewed,
        model: 'demo',
        summary:
          verdict === 'PASS'
            ? `Agent followed the survey script and transferred to Holiday Inn Club Vacations correctly. Score ${points}/100.`
            : autoFailTriggered
              ? 'Automatic fail: a fatal transfer/clarity rule was broken.'
              : `${mistakes.length} non-fatal script deviation(s). Score ${points}/100 (below pass threshold).`,
        criterionResults: {
          create: results.map((r) => ({
            criterionId: r.criterion.id,
            aiVerdict: r.verdict,
            verdict: r.verdict,
            evidenceQuote:
              r.verdict === 'FAIL'
                ? bias === 'bad'
                  ? 'Let me put you through to Holiday Inn now.'
                  : ''
                : '',
            evidenceTimestampMs: 7700,
            aiRationale:
              r.verdict === 'FAIL'
                ? 'Transcript indicates this rule was not followed.'
                : 'No deviation detected for this rule.',
          })),
        },
      },
    });
  }

  console.log(`Seed complete.`);
  console.log(`  Teams: 2, Agents: ${agents.length}, Interactions: ${NUM} (${sampledCount} sampled/scored)`);
  console.log(`\nDemo logins (password: ${PASSWORD}):`);
  console.log('  admin@sublogical.com     (ADMIN)');
  console.log('  manager@sublogical.com   (QA_MANAGER)');
  console.log('  analyst@sublogical.com   (QA_ANALYST)');
  console.log('  lead@sublogical.com      (TEAM_LEAD)');
  console.log('  agent@sublogical.com     (AGENT)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
