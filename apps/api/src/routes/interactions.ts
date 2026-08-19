import { Router } from 'express';
import { InteractionQuery, ManualInteractionInput } from '@qa/shared';
import { prisma, type Prisma } from '@qa/db';
import { AssemblyAIClient, mapSpeakers, utterancesToText } from '@qa/transcribe';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { interactionScopeWhere } from '../lib/scope';
import { presignRecordingUrl } from '../lib/storage';
import { runScoringForInteraction } from '../lib/scoring-run';
import { config } from '../env';
import { audit } from '../lib/audit';

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
        manual: r.manual,
        status: r.status,
        statusError: r.statusError,
        evaluation: r.evaluations[0] ?? null,
      })),
    });
  }),
);

// POST /interactions/manual — add a call by pasting a recording link. Creates
// the row only; POST /:id/advance drives it through transcribe → score.
interactionsRouter.post(
  '/manual',
  requirePermission('interaction:create'),
  asyncHandler(async (req, res) => {
    const input = ManualInteractionInput.parse(req.body);
    const interaction = await prisma.interaction.create({
      data: {
        dialogId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        segmentId: 'manual',
        agentId: input.agentId ?? null,
        queue: input.queue ?? null,
        direction: input.direction,
        startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
        durationSec: input.durationSec ?? 0,
        recordingKey: input.recordingUrl,
        sampled: true,
        manual: true,
        status: 'INGESTED',
      },
    });
    await audit({
      actorId: req.user!.id,
      action: 'interaction.manual_create',
      entity: 'Interaction',
      entityId: interaction.id,
    });
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
