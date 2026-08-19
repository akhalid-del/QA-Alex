import { Router } from 'express';
import { enqueueIngestPoll, enqueueScore } from '@qa/pipeline';
import { prisma } from '@qa/db';
import { asyncHandler, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';
import { config } from '../env';

export const pipelineRouter = Router();
pipelineRouter.use(authenticate);

// No REDIS_URL yet = the queue (Upstash/Railway worker) isn't wired up.
// Fail fast with a clear message instead of hanging trying to reach a
// nonexistent localhost Redis (especially bad on a serverless host).
pipelineRouter.use((_req, res, next) => {
  if (!config.REDIS_URL) {
    res.status(503).json({ error: 'Pipeline queue is not configured yet (REDIS_URL unset). Set up Upstash + the worker first.' });
    return;
  }
  next();
});

// POST /pipeline/ingest/poll — trigger a one-off RingCX ingest poll now.
pipelineRouter.post(
  '/ingest/poll',
  requirePermission('ingest:trigger'),
  asyncHandler(async (req, res) => {
    const { from, to } = req.body ?? {};
    await enqueueIngestPoll({ windowStartISO: from, windowEndISO: to });
    await audit({ actorId: req.user!.id, action: 'ingest.poll.trigger', entity: 'Pipeline' });
    res.status(202).json({ queued: true });
  }),
);

// POST /pipeline/score/:interactionId — (re)score a transcribed call.
pipelineRouter.post(
  '/score/:interactionId',
  requirePermission('evaluation:review'),
  asyncHandler(async (req, res) => {
    const interaction = await prisma.interaction.findUnique({
      where: { id: req.params.interactionId! },
      select: { id: true, transcript: { select: { id: true } } },
    });
    if (!interaction) throw notFound('Interaction not found');
    await enqueueScore({ interactionId: interaction.id });
    await audit({
      actorId: req.user!.id,
      action: 'score.trigger',
      entity: 'Interaction',
      entityId: interaction.id,
    });
    res.status(202).json({ queued: true });
  }),
);
