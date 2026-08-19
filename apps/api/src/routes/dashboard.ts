import { Router } from 'express';
import { prisma } from '@qa/db';
import { asyncHandler } from '../lib/http';
import { authenticate } from '../middleware/auth';
import { interactionScopeWhere } from '../lib/scope';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// GET /dashboard/summary — KPIs, trend, per-agent and per-criterion breakdowns,
// all scoped to the caller's role (all / team / own).
dashboardRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const scope = interactionScopeWhere(req.user!);
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const teamId = req.query.teamId ? String(req.query.teamId) : null;
    const agentId = req.query.agentId ? String(req.query.agentId) : null;

    const interactionWhere = {
      AND: [
        scope,
        ...(from || to
          ? [{ startedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }]
          : []),
        ...(teamId ? [{ agent: { teamId } }] : []),
        ...(agentId ? [{ agentId }] : []),
      ],
    };

    const evaluations = await prisma.evaluation.findMany({
      where: { interaction: interactionWhere },
      select: {
        finalVerdict: true,
        reviewed: true,
        autoFailTriggered: true,
        interaction: { select: { startedAt: true, agentId: true, agent: { select: { name: true } } } },
        criterionResults: {
          select: { verdict: true, criterion: { select: { code: true, title: true, autoFail: true } } },
        },
      },
    });

    const total = evaluations.length;
    const passed = evaluations.filter((e) => e.finalVerdict === 'PASS').length;
    const failed = total - passed;
    const reviewed = evaluations.filter((e) => e.reviewed).length;
    const autoFails = evaluations.filter((e) => e.autoFailTriggered).length;

    // Trend: pass rate by day.
    const byDay = new Map<string, { pass: number; total: number }>();
    for (const e of evaluations) {
      const day = e.interaction.startedAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { pass: 0, total: 0 };
      bucket.total++;
      if (e.finalVerdict === 'PASS') bucket.pass++;
      byDay.set(day, bucket);
    }
    const trend = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({ date, passRate: b.total ? b.pass / b.total : 0, total: b.total }));

    // Per-agent pass rate.
    const byAgent = new Map<string, { name: string; pass: number; total: number }>();
    for (const e of evaluations) {
      const id = e.interaction.agentId ?? 'unknown';
      const name = e.interaction.agent?.name ?? 'Unknown';
      const bucket = byAgent.get(id) ?? { name, pass: 0, total: 0 };
      bucket.total++;
      if (e.finalVerdict === 'PASS') bucket.pass++;
      byAgent.set(id, bucket);
    }
    const agents = [...byAgent.entries()]
      .map(([agentId, b]) => ({ agentId, name: b.name, passRate: b.total ? b.pass / b.total : 0, total: b.total }))
      .sort((a, b) => b.total - a.total);

    // Top failing criteria + fatal/non-fatal split.
    const critFails = new Map<string, { title: string; fails: number; autoFail: boolean }>();
    let fatalFails = 0;
    let nonFatalFails = 0;
    for (const e of evaluations) {
      for (const cr of e.criterionResults) {
        if (cr.verdict !== 'FAIL') continue;
        if (cr.criterion.autoFail) fatalFails++;
        else nonFatalFails++;
        const key = cr.criterion.code;
        const bucket = critFails.get(key) ?? { title: cr.criterion.title, fails: 0, autoFail: cr.criterion.autoFail };
        bucket.fails++;
        critFails.set(key, bucket);
      }
    }
    const failingCriteria = [...critFails.entries()]
      .map(([code, b]) => ({ code, title: b.title, fails: b.fails, autoFail: b.autoFail }))
      .sort((a, b) => b.fails - a.fails)
      .slice(0, 8);

    const openDisputes = await prisma.dispute.count({
      where: { status: 'OPEN', evaluation: { interaction: interactionWhere } },
    });

    res.json({
      kpis: {
        totalScored: total,
        passed,
        failed,
        passRate: total ? passed / total : 0,
        reviewed,
        pendingReview: total - reviewed,
        autoFails,
        openDisputes,
        fatalFails,
        nonFatalFails,
      },
      trend,
      agents,
      failingCriteria,
    });
  }),
);
