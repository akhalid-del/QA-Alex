import { prisma } from '@qa/db';
import { ScoringClient, type ScoringScorecard } from '@qa/scoring';
import { utterancesToText } from '@qa/transcribe';
import type { Utterance } from '@qa/shared';
import type { ScoreJob } from '@qa/pipeline';
import { config } from '../env';

export async function runScore(job: ScoreJob): Promise<void> {
  if (!config.ANTHROPIC_API_KEY) {
    console.warn('[score] ANTHROPIC_API_KEY not set — skipping.');
    return;
  }
  const interaction = await prisma.interaction.findUnique({
    where: { id: job.interactionId },
    include: { transcript: true, agent: true },
  });
  if (!interaction) throw new Error(`Interaction ${job.interactionId} not found`);
  if (!interaction.transcript) throw new Error(`Interaction ${job.interactionId} has no transcript`);

  const scorecard = job.scorecardId
    ? await prisma.scorecard.findUnique({ where: { id: job.scorecardId }, include: { criteria: true } })
    : await prisma.scorecard.findFirst({ where: { active: true }, include: { criteria: true } });
  if (!scorecard) throw new Error('No active scorecard to score against');

  await prisma.interaction.update({ where: { id: interaction.id }, data: { status: 'SCORING' } });

  try {
    const scoringScorecard: ScoringScorecard = {
      name: scorecard.name,
      scoringMode: scorecard.scoringMode,
      startingScore: scorecard.startingScore,
      passThreshold: scorecard.passThreshold,
      referenceScript: scorecard.referenceScript,
      dispositionRules: scorecard.dispositionRules,
      criteria: scorecard.criteria.map((c) => ({
        code: c.code,
        title: c.title,
        guidance: c.guidance,
        category: c.category,
        weight: c.weight,
        deduction: c.deduction,
        autoFail: c.autoFail,
      })),
    };

    const transcriptText =
      interaction.transcript.fullText ||
      utterancesToText(interaction.transcript.utterances as unknown as Utterance[]);

    const client = new ScoringClient({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL });
    const result = await client.score({
      scorecard: scoringScorecard,
      direction: interaction.direction,
      transcriptText,
      agentName: interaction.agent?.name,
      queue: interaction.queue ?? undefined,
      agentDisposition: interaction.agentDisposition ?? undefined,
    });

    const codeToId = new Map(scorecard.criteria.map((c) => [c.code, c.id]));

    await prisma.$transaction(async (tx) => {
      const evaluation = await tx.evaluation.create({
        data: {
          interactionId: interaction.id,
          scorecardId: scorecard.id,
          aiVerdict: result.verdict,
          aiScore: result.score,
          finalVerdict: result.verdict,
          finalScore: result.score,
          autoFailTriggered: result.autoFailTriggered,
          model: result.model,
          summary: result.summary,
        },
      });
      for (const sc of result.criteria) {
        const criterionId = codeToId.get(sc.code);
        if (!criterionId) continue;
        await tx.criterionResult.create({
          data: {
            evaluationId: evaluation.id,
            criterionId,
            aiVerdict: sc.verdict,
            verdict: sc.verdict,
            evidenceQuote: sc.evidenceQuote,
            evidenceTimestampMs: sc.evidenceTimestampMs,
            aiRationale: sc.rationale,
          },
        });
      }
    });

    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { status: 'SCORED', statusError: null },
    });
    console.log(`[score] ${interaction.id} → ${result.verdict} (${result.points ?? '—'}/100)`);
  } catch (err) {
    await prisma.interaction.update({
      where: { id: interaction.id },
      data: { status: 'FAILED', statusError: String(err) },
    });
    throw err;
  }
}
