import { Router } from 'express';
import { ScorecardInput } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';

export const scorecardsRouter = Router();
scorecardsRouter.use(authenticate);

// GET /scorecards — list (active first).
scorecardsRouter.get(
  '/',
  requirePermission('scorecard:read'),
  asyncHandler(async (_req, res) => {
    const cards = await prisma.scorecard.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { criteria: true, evaluations: true } } },
    });
    res.json(cards);
  }),
);

// GET /scorecards/:id — full detail with criteria.
scorecardsRouter.get(
  '/:id',
  requirePermission('scorecard:read'),
  asyncHandler(async (req, res) => {
    const card = await prisma.scorecard.findUnique({
      where: { id: req.params.id },
      include: { criteria: { orderBy: { order: 'asc' } } },
    });
    if (!card) throw notFound('Scorecard not found');
    res.json(card);
  }),
);

// POST /scorecards — create a new active scorecard, superseding others of the
// same name (versioned). This is how the company's quality guidelines are
// loaded/updated.
scorecardsRouter.post(
  '/',
  requirePermission('scorecard:write'),
  asyncHandler(async (req, res) => {
    const input = ScorecardInput.parse(req.body);

    const prior = await prisma.scorecard.findFirst({
      where: { name: input.name },
      orderBy: { version: 'desc' },
    });
    const version = (prior?.version ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      // Deactivate previous versions of the same name.
      await tx.scorecard.updateMany({ where: { name: input.name }, data: { active: false } });
      return tx.scorecard.create({
        data: {
          name: input.name,
          description: input.description,
          scoringMode: input.scoringMode,
          startingScore: input.startingScore,
          passThreshold: input.passThreshold,
          referenceScript: input.referenceScript,
          version,
          active: true,
          createdBy: req.user!.id,
          criteria: {
            create: input.criteria.map((c, i) => ({
              code: c.code,
              title: c.title,
              guidance: c.guidance,
              category: c.category,
              weight: c.weight,
              deduction: c.deduction,
              autoFail: c.autoFail,
              order: c.order || i,
            })),
          },
        },
        include: { criteria: { orderBy: { order: 'asc' } } },
      });
    });

    await audit({
      actorId: req.user!.id,
      action: 'scorecard.create',
      entity: 'Scorecard',
      entityId: created.id,
      metadata: { name: created.name, version },
    });
    res.status(201).json(created);
  }),
);
