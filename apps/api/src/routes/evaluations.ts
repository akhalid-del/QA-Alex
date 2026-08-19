import { Router, type Request } from 'express';
import { computeVerdict, DisputeInput, ResolveDisputeInput, ReviewInput } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, badRequest, forbidden, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { interactionScopeWhere } from '../lib/scope';
import { audit } from '../lib/audit';

export const evaluationsRouter = Router();
evaluationsRouter.use(authenticate);

async function loadEvaluationScoped(evaluationId: string, req: Request) {
  const scope = interactionScopeWhere(req.user!);
  const evaluation = await prisma.evaluation.findFirst({
    where: { id: evaluationId, interaction: { AND: [scope] } },
    include: {
      scorecard: { include: { criteria: true } },
      criterionResults: true,
      interaction: true,
    },
  });
  return evaluation;
}

// GET /evaluations/:id
evaluationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const evaluation = await loadEvaluationScoped(req.params.id!, req);
    if (!evaluation) throw notFound('Evaluation not found');
    res.json(evaluation);
  }),
);

// POST /evaluations/:id/review — analyst confirms or overrides criteria.
evaluationsRouter.post(
  '/:id/review',
  requirePermission('evaluation:review'),
  asyncHandler(async (req, res) => {
    const input = ReviewInput.parse(req.body);
    const evaluation = await loadEvaluationScoped(req.params.id!, req);
    if (!evaluation) throw notFound('Evaluation not found');

    const resultsById = new Map(evaluation.criterionResults.map((r) => [r.id, r]));

    // Apply overrides.
    for (const c of input.criteria) {
      const existing = resultsById.get(c.criterionResultId);
      if (!existing) throw badRequest(`Unknown criterionResultId: ${c.criterionResultId}`);
      if (existing.verdict !== c.verdict || c.note) {
        await prisma.criterionResult.update({
          where: { id: c.criterionResultId },
          data: {
            verdict: c.verdict,
            humanOverride: existing.aiVerdict !== c.verdict,
            overrideNote: c.note,
          },
        });
        existing.verdict = c.verdict;
      }
    }

    // Recompute the final verdict from the (possibly overridden) criteria.
    const criterionById = new Map(evaluation.scorecard.criteria.map((c) => [c.id, c]));
    const inputs = evaluation.criterionResults.map((r) => {
      const crit = criterionById.get(r.criterionId)!;
      return { weight: crit.weight, deduction: crit.deduction, autoFail: crit.autoFail, verdict: r.verdict };
    });
    const { verdict, score, autoFailTriggered } = computeVerdict(inputs, {
      mode: evaluation.scorecard.scoringMode,
      passThreshold: evaluation.scorecard.passThreshold,
      startingScore: evaluation.scorecard.startingScore,
    });

    await prisma.$transaction([
      prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { finalVerdict: verdict, finalScore: score, autoFailTriggered, reviewed: true },
      }),
      prisma.review.create({
        data: { evaluationId: evaluation.id, reviewerId: req.user!.id, note: input.note },
      }),
      prisma.interaction.update({
        where: { id: evaluation.interactionId },
        data: { status: 'REVIEWED' },
      }),
    ]);

    await audit({
      actorId: req.user!.id,
      action: 'evaluation.review',
      entity: 'Evaluation',
      entityId: evaluation.id,
      metadata: { finalVerdict: verdict, overrides: input.criteria.length },
    });

    res.json({ finalVerdict: verdict, finalScore: score, autoFailTriggered });
  }),
);

// POST /evaluations/:id/dispute — agent disagrees with a verdict.
evaluationsRouter.post(
  '/:id/dispute',
  requirePermission('evaluation:dispute'),
  asyncHandler(async (req, res) => {
    const input = DisputeInput.parse(req.body);
    const evaluation = await loadEvaluationScoped(req.params.id!, req);
    if (!evaluation) throw notFound('Evaluation not found');
    // Agents may only dispute their own calls (scope already enforces this, but
    // double-check the agent linkage).
    if (req.user!.agentId && evaluation.interaction.agentId !== req.user!.agentId) {
      throw forbidden('You can only dispute your own calls');
    }

    const dispute = await prisma.dispute.create({
      data: { evaluationId: evaluation.id, raisedById: req.user!.id, reason: input.reason },
    });
    await audit({
      actorId: req.user!.id,
      action: 'evaluation.dispute',
      entity: 'Dispute',
      entityId: dispute.id,
    });
    res.status(201).json(dispute);
  }),
);

// POST /disputes/:id/resolve — manager/lead resolves a dispute.
evaluationsRouter.post(
  '/disputes/:id/resolve',
  requirePermission('evaluation:resolve_dispute'),
  asyncHandler(async (req, res) => {
    const input = ResolveDisputeInput.parse(req.body);
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id! } });
    if (!dispute) throw notFound('Dispute not found');

    const updated = await prisma.dispute.update({
      where: { id: dispute.id },
      data: {
        status: input.status,
        resolution: input.resolution,
        resolvedById: req.user!.id,
        resolvedAt: new Date(),
      },
    });
    await audit({
      actorId: req.user!.id,
      action: 'dispute.resolve',
      entity: 'Dispute',
      entityId: dispute.id,
      metadata: { status: input.status },
    });
    res.json(updated);
  }),
);
