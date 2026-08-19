import { Router } from 'express';
import { InteractionQuery } from '@qa/shared';
import { prisma, type Prisma } from '@qa/db';
import { asyncHandler, notFound } from '../lib/http';
import { authenticate } from '../middleware/auth';
import { interactionScopeWhere } from '../lib/scope';
import { presignRecordingUrl } from '../lib/storage';

export const interactionsRouter = Router();
interactionsRouter.use(authenticate);

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
        status: r.status,
        evaluation: r.evaluations[0] ?? null,
      })),
    });
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
