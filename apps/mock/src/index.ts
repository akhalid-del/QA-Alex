import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { computeVerdict, type CriterionVerdict } from '@qa/shared';
import {
  agentName,
  agents,
  interactions,
  permsFor,
  scorecard,
  scorecards,
  seed,
  teams,
  userByEmail,
  userById,
  users,
  visibleInteractions,
  type Interaction,
  type MockUser,
} from './store';

seed(45);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Auth (mock: token = base64(email)) ──────────────────────────────────────
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: MockUser;
    }
  }
}
function auth(req: Request, res: Response, next: NextFunction) {
  const h = req.header('authorization');
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const email = Buffer.from(h.slice(7), 'base64').toString('utf8');
    const u = userByEmail(email);
    if (!u) return res.status(401).json({ error: 'Invalid token' });
    req.user = u;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, mock: true }));

app.post('/auth/login', (req, res) => {
  const { email } = req.body ?? {};
  const u = userByEmail(String(email));
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  // Mock accepts any password for the demo accounts.
  const token = Buffer.from(u.email).toString('base64');
  res.json({ token, user: u, permissions: permsFor(u.role) });
});

app.get('/auth/me', auth, (req, res) => {
  res.json({ user: req.user, permissions: permsFor(req.user!.role) });
});

// ── Interactions ────────────────────────────────────────────────────────────
function listItem(i: Interaction) {
  return {
    id: i.id,
    dialogId: i.dialogId,
    segmentId: i.segmentId,
    agent: i.agentId ? { id: i.agentId, name: agentName(i.agentId) } : null,
    queue: i.queue,
    direction: i.direction,
    startedAt: i.startedAt,
    durationSec: i.durationSec,
    sampled: i.sampled,
    status: i.status,
    evaluation: i.evaluation
      ? { id: i.evaluation.id, finalVerdict: i.evaluation.finalVerdict, finalScore: i.evaluation.finalScore, reviewed: i.evaluation.reviewed, autoFailTriggered: i.evaluation.autoFailTriggered }
      : null,
  };
}

app.get('/interactions', auth, (req, res) => {
  let rows = visibleInteractions(req.user!);
  const { status, verdict, agentId } = req.query as Record<string, string>;
  if (status) rows = rows.filter((r) => r.status === status);
  if (verdict) rows = rows.filter((r) => r.evaluation?.finalVerdict === verdict);
  if (agentId) rows = rows.filter((r) => r.agentId === agentId);
  rows = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 25);
  const total = rows.length;
  const items = rows.slice((page - 1) * pageSize, page * pageSize).map(listItem);
  res.json({ total, page, pageSize, items });
});

app.get('/interactions/:id', auth, (req, res) => {
  const i = visibleInteractions(req.user!).find((x) => x.id === req.params.id);
  if (!i) return res.status(404).json({ error: 'Interaction not found' });
  const evaluation = i.evaluation
    ? {
        ...i.evaluation,
        scorecard: {
          id: scorecard.id,
          name: scorecard.name,
          scoringMode: scorecard.scoringMode,
          startingScore: scorecard.startingScore,
          passThreshold: scorecard.passThreshold,
          criteria: scorecard.criteria,
        },
      }
    : null;
  res.json({
    id: i.id,
    agent: i.agentId ? { name: agentName(i.agentId) } : null,
    queue: i.queue,
    direction: i.direction,
    startedAt: i.startedAt,
    durationSec: i.durationSec,
    status: i.status,
    recordingUrl: null,
    transcript: i.transcript,
    evaluation,
  });
});

// ── Evaluations: review / dispute / resolve ──────────────────────────────────
function findEvalById(id: string): { interaction: Interaction; evaluation: NonNullable<Interaction['evaluation']> } | null {
  for (const i of interactions) if (i.evaluation?.id === id) return { interaction: i, evaluation: i.evaluation };
  return null;
}

app.post('/evaluations/:id/review', auth, (req, res) => {
  const found = findEvalById(req.params.id!);
  if (!found) return res.status(404).json({ error: 'Evaluation not found' });
  const { criteria = [], note } = req.body ?? {};
  const byId = new Map(found.evaluation.criterionResults.map((r) => [r.id, r]));
  for (const c of criteria as { criterionResultId: string; verdict: CriterionVerdict }[]) {
    const r = byId.get(c.criterionResultId);
    if (r) {
      r.verdict = c.verdict;
      r.humanOverride = r.aiVerdict !== c.verdict;
    }
  }
  const critById = new Map(scorecard.criteria.map((c) => [c.id, c]));
  const { verdict, score, autoFailTriggered } = computeVerdict(
    found.evaluation.criterionResults.map((r) => {
      const crit = critById.get(r.criterionId)!;
      return { weight: crit.weight, deduction: crit.deduction, autoFail: crit.autoFail, verdict: r.verdict };
    }),
    { mode: scorecard.scoringMode, passThreshold: scorecard.passThreshold, startingScore: scorecard.startingScore },
  );
  found.evaluation.finalVerdict = verdict;
  found.evaluation.finalScore = score;
  found.evaluation.autoFailTriggered = autoFailTriggered;
  found.evaluation.reviewed = true;
  found.evaluation.reviews.unshift({ id: `rev-${Date.now()}`, note: note ?? null, reviewer: { id: req.user!.id, name: req.user!.name }, createdAt: new Date().toISOString() });
  found.interaction.status = 'REVIEWED';
  res.json({ finalVerdict: verdict, finalScore: score, autoFailTriggered });
});

app.post('/evaluations/:id/dispute', auth, (req, res) => {
  const found = findEvalById(req.params.id!);
  if (!found) return res.status(404).json({ error: 'Evaluation not found' });
  const dispute = { id: `disp-${Date.now()}`, reason: String(req.body?.reason ?? ''), status: 'OPEN' as const, resolution: null };
  found.evaluation.disputes.unshift(dispute);
  res.status(201).json(dispute);
});

app.post('/evaluations/disputes/:id/resolve', auth, (req, res) => {
  for (const i of interactions) {
    const d = i.evaluation?.disputes.find((x) => x.id === req.params.id);
    if (d) {
      d.status = req.body?.status ?? 'UPHELD';
      d.resolution = req.body?.resolution ?? null;
      return res.json(d);
    }
  }
  res.status(404).json({ error: 'Dispute not found' });
});

// ── Scorecards ────────────────────────────────────────────────────────────
app.get('/scorecards', auth, (_req, res) => {
  res.json(
    scorecards.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      active: s.active,
      passThreshold: s.passThreshold,
      description: s.description,
      _count: { criteria: s.criteria.length, evaluations: interactions.filter((i) => i.evaluation).length },
    })),
  );
});
app.get('/scorecards/:id', auth, (req, res) => {
  const s = scorecards.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Scorecard not found' });
  res.json(s);
});
app.post('/scorecards', auth, (req, res) => {
  const body = req.body ?? {};
  const created = {
    ...scorecard,
    id: `sc-${scorecards.length + 1}`,
    name: body.name ?? scorecard.name,
    description: body.description ?? '',
    scoringMode: body.scoringMode ?? 'DEDUCTION',
    startingScore: body.startingScore ?? 100,
    passThreshold: body.passThreshold ?? 0.9,
    referenceScript: body.referenceScript ?? '',
    version: (scorecards[0]?.version ?? 1) + 1,
    active: true,
    criteria: (body.criteria ?? scorecard.criteria).map((c: Record<string, unknown>, i: number) => ({
      id: `crit-new-${i}`,
      code: c.code ?? `C${i}`,
      title: c.title ?? '',
      guidance: c.guidance ?? '',
      category: c.category ?? 'General',
      weight: c.weight ?? 1,
      deduction: c.deduction ?? 0,
      autoFail: c.autoFail ?? false,
      order: i,
    })),
  };
  scorecards.forEach((s) => (s.active = false));
  scorecards.unshift(created);
  res.status(201).json(created);
});

// ── Agents / teams / users ────────────────────────────────────────────────
app.get('/agents', auth, (_req, res) => {
  res.json(
    agents.map((a) => ({
      id: a.id,
      rcAgentId: a.rcAgentId,
      username: a.username,
      name: a.name,
      active: a.active,
      teamId: a.teamId,
      team: a.teamId && teams.find((t) => t.id === a.teamId) ? { id: a.teamId, name: teams.find((t) => t.id === a.teamId)!.name } : null,
      _count: { interactions: interactions.filter((i) => i.agentId === a.id).length },
    })),
  );
});
app.post('/agents', auth, (req, res) => {
  const b = req.body ?? {};
  if (!b.rcAgentId || !b.username || !b.name) return res.status(400).json({ error: 'rcAgentId, username, name required' });
  if (agents.some((a) => a.rcAgentId === b.rcAgentId)) return res.status(400).json({ error: 'RingCX ID already exists' });
  const agent = { id: `agent-${Date.now()}`, rcAgentId: b.rcAgentId, username: b.username, name: b.name, teamId: b.teamId ?? null, active: b.active ?? true };
  agents.push(agent);
  res.status(201).json(agent);
});
app.patch('/agents/:id', auth, (req, res) => {
  const a = agents.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  const b = req.body ?? {};
  if (b.username !== undefined) a.username = b.username;
  if (b.name !== undefined) a.name = b.name;
  if (b.teamId !== undefined) a.teamId = b.teamId;
  if (b.active !== undefined) a.active = b.active;
  res.json(a);
});
app.get('/agents/teams', auth, (_req, res) => {
  res.json(
    teams.map((t) => ({
      id: t.id,
      name: t.name,
      lead: t.leadId ? { id: t.leadId, name: t.leadName } : null,
      _count: { agents: agents.filter((a) => a.teamId === t.id).length },
    })),
  );
});
app.post('/agents/teams', auth, (req, res) => {
  const b = req.body ?? {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  const lead = b.leadId ? users.find((u) => u.id === b.leadId) : null;
  const team = { id: `team-${Date.now()}`, name: b.name, leadId: b.leadId ?? null, leadName: lead?.name ?? null };
  teams.push(team);
  res.status(201).json(team);
});
app.patch('/agents/teams/:id', auth, (req, res) => {
  const t = teams.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Team not found' });
  const b = req.body ?? {};
  if (b.name !== undefined) t.name = b.name;
  if (b.leadId !== undefined) {
    t.leadId = b.leadId;
    t.leadName = b.leadId ? (users.find((u) => u.id === b.leadId)?.name ?? null) : null;
  }
  res.json(t);
});
app.get('/users', auth, (req, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  res.json(users.map((u) => ({ ...u, createdAt: new Date().toISOString() })));
});
app.post('/users', auth, (req, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  const b = req.body ?? {};
  if (!b.email || !b.name || !b.password || !b.role) return res.status(400).json({ error: 'email, name, password, role required' });
  if (users.some((u) => u.email === b.email)) return res.status(400).json({ error: 'Email already exists' });
  const user: MockUser = { id: `u-${Date.now()}`, email: b.email, name: b.name, role: b.role, teamId: b.teamId ?? null, agentId: b.agentId ?? null, active: true };
  users.push(user);
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, active: true });
});
app.patch('/users/:id', auth, (req, res) => {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  const u = users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const b = req.body ?? {};
  if (b.name !== undefined) u.name = b.name;
  if (b.role !== undefined) u.role = b.role;
  if (b.active !== undefined) u.active = b.active;
  if (b.teamId !== undefined) u.teamId = b.teamId;
  if (b.agentId !== undefined) u.agentId = b.agentId;
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active });
});

// ── Dashboard ────────────────────────────────────────────────────────────
app.get('/dashboard/summary', auth, (req, res) => {
  const { from, to, teamId, agentId } = req.query as Record<string, string>;
  const teamAgentIds = teamId ? new Set(agents.filter((a) => a.teamId === teamId).map((a) => a.id)) : null;
  const evals = visibleInteractions(req.user!)
    .filter((i) => i.evaluation)
    .filter((i) => (from ? i.startedAt >= from : true) && (to ? i.startedAt <= to : true))
    .filter((i) => (teamAgentIds ? i.agentId && teamAgentIds.has(i.agentId) : true))
    .filter((i) => (agentId ? i.agentId === agentId : true))
    .map((i) => ({ i, e: i.evaluation! }));
  const total = evals.length;
  const passed = evals.filter((x) => x.e.finalVerdict === 'PASS').length;
  const reviewed = evals.filter((x) => x.e.reviewed).length;
  const autoFails = evals.filter((x) => x.e.autoFailTriggered).length;
  const openDisputes = evals.reduce((n, x) => n + x.e.disputes.filter((d) => d.status === 'OPEN').length, 0);

  const byDay = new Map<string, { pass: number; total: number }>();
  const byAgent = new Map<string, { name: string; pass: number; total: number }>();
  const critFails = new Map<string, { title: string; fails: number; autoFail: boolean }>();
  let fatalFails = 0;
  let nonFatalFails = 0;
  for (const { i, e } of evals) {
    const day = i.startedAt.slice(0, 10);
    const d = byDay.get(day) ?? { pass: 0, total: 0 };
    d.total++;
    if (e.finalVerdict === 'PASS') d.pass++;
    byDay.set(day, d);

    const aid = i.agentId ?? 'unknown';
    const a = byAgent.get(aid) ?? { name: agentName(i.agentId) ?? 'Unknown', pass: 0, total: 0 };
    a.total++;
    if (e.finalVerdict === 'PASS') a.pass++;
    byAgent.set(aid, a);

    for (const cr of e.criterionResults) {
      if (cr.verdict !== 'FAIL') continue;
      const crit = scorecard.criteria.find((c) => c.id === cr.criterionId)!;
      if (crit.autoFail) fatalFails++;
      else nonFatalFails++;
      const b = critFails.get(crit.code) ?? { title: crit.title, fails: 0, autoFail: crit.autoFail };
      b.fails++;
      critFails.set(crit.code, b);
    }
  }
  res.json({
    kpis: { totalScored: total, passed, failed: total - passed, passRate: total ? passed / total : 0, reviewed, pendingReview: total - reviewed, autoFails, openDisputes, fatalFails, nonFatalFails },
    trend: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, b]) => ({ date, passRate: b.total ? b.pass / b.total : 0, total: b.total })),
    agents: [...byAgent.entries()].map(([aid, b]) => ({ agentId: aid, name: b.name, passRate: b.total ? b.pass / b.total : 0, total: b.total })).sort((a, b) => b.total - a.total),
    failingCriteria: [...critFails.entries()].map(([code, b]) => ({ code, title: b.title, fails: b.fails, autoFail: b.autoFail })).sort((a, b) => b.fails - a.fails).slice(0, 8),
  });
});

// ── Pipeline (no-op in mock) ────────────────────────────────────────────────
app.post('/pipeline/ingest/poll', auth, (_req, res) => res.status(202).json({ queued: true, mock: true }));
app.post('/pipeline/score/:id', auth, (_req, res) => res.status(202).json({ queued: true, mock: true }));

const PORT = Number(process.env.API_PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Mock API listening on http://localhost:${PORT}  (in-memory, ${interactions.length} interactions seeded)`);
  console.log('Login with any demo account (any password): admin@sublogical.com / manager@ / analyst@ / lead@ / agent@');
});
