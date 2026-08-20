import { Router } from 'express';
import { CreateAgentInput, CreateTeamInput, ImportAgentsInput, UpdateAgentInput, UpdateTeamInput } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';

export const agentsRouter = Router();
agentsRouter.use(authenticate);

// Derive a RingCX id + username from the name when they aren't provided yet
// (testing phase, before RingCX access). Kept in one place so single-create
// and bulk-import behave identically.
function agentDefaults(name: string, rcAgentId?: string, username?: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'agent';
  return {
    rcAgentId: rcAgentId?.trim() || `demo-${slug}-${Math.random().toString(36).slice(2, 7)}`,
    username: username?.trim() || slug,
  };
}

// GET /agents — roster with team + call counts.
agentsRouter.get(
  '/',
  requirePermission('agent:read'),
  asyncHandler(async (_req, res) => {
    const agents = await prisma.agent.findMany({
      orderBy: { name: 'asc' },
      include: {
        team: { select: { id: true, name: true } },
        _count: { select: { interactions: true } },
      },
    });
    res.json(agents);
  }),
);

// GET /agents/teams — list teams with lead + agent counts.
agentsRouter.get(
  '/teams',
  requirePermission('agent:read'),
  asyncHandler(async (_req, res) => {
    const teams = await prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        lead: { select: { id: true, name: true } },
        _count: { select: { agents: true } },
      },
    });
    res.json(teams);
  }),
);

// POST /agents — create an agent manually.
agentsRouter.post(
  '/',
  requirePermission('agent:write'),
  asyncHandler(async (req, res) => {
    const input = CreateAgentInput.parse(req.body);
    // During testing there's no real RingCX id yet: derive placeholders so
    // agents can be added by name alone.
    const { rcAgentId, username } = agentDefaults(input.name, input.rcAgentId, input.username);
    const exists = await prisma.agent.findUnique({ where: { rcAgentId } });
    if (exists) throw badRequest('An agent with that RingCX ID already exists');
    const agent = await prisma.agent.create({
      data: {
        rcAgentId,
        username,
        name: input.name,
        teamId: input.teamId ?? null,
        active: input.active ?? true,
      },
    });
    await audit({ actorId: req.user!.id, action: 'agent.create', entity: 'Agent', entityId: agent.id });
    res.status(201).json(agent);
  }),
);

// POST /agents/import — bulk-create agents from a parsed CSV. Teams named in
// the rows are auto-created (deduped by name). Missing RingCX ids/usernames
// are generated. Returns per-row errors without failing the whole batch.
agentsRouter.post(
  '/import',
  requirePermission('agent:write'),
  asyncHandler(async (req, res) => {
    const { rows } = ImportAgentsInput.parse(req.body);

    // Upsert every referenced team once, by name.
    const teamNames = [...new Set(rows.map((r) => r.team?.trim()).filter((n): n is string => !!n))];
    const teamByName = new Map<string, string>();
    let teamsCreated = 0;
    for (const name of teamNames) {
      const existing = await prisma.team.findFirst({ where: { name } });
      if (existing) {
        teamByName.set(name, existing.id);
      } else {
        const team = await prisma.team.create({ data: { name } });
        teamByName.set(name, team.id);
        teamsCreated++;
      }
    }

    let agentsCreated = 0;
    const errors: { row: number; name: string; error: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      try {
        const { rcAgentId, username } = agentDefaults(r.name, r.rcAgentId, r.username);
        const teamId = r.team?.trim() ? (teamByName.get(r.team.trim()) ?? null) : null;
        await prisma.agent.create({ data: { rcAgentId, username, name: r.name.trim(), teamId, active: true } });
        agentsCreated++;
      } catch (e) {
        const msg = e instanceof Error && /unique/i.test(e.message) ? 'duplicate RingCX ID' : 'could not create';
        errors.push({ row: i + 1, name: r.name, error: msg });
      }
    }

    await audit({ actorId: req.user!.id, action: 'agent.import', entity: 'Agent', metadata: { agentsCreated, teamsCreated } });
    res.status(201).json({ agentsCreated, teamsCreated, teamsTouched: teamNames.length, errors });
  }),
);

// PATCH /agents/:id — edit an agent.
agentsRouter.patch(
  '/:id',
  requirePermission('agent:write'),
  asyncHandler(async (req, res) => {
    const input = UpdateAgentInput.parse(req.body);
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('Agent not found');
    const agent = await prisma.agent.update({
      where: { id: existing.id },
      data: {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    await audit({ actorId: req.user!.id, action: 'agent.update', entity: 'Agent', entityId: agent.id });
    res.json(agent);
  }),
);

// POST /agents/teams — create a team.
agentsRouter.post(
  '/teams',
  requirePermission('agent:write'),
  asyncHandler(async (req, res) => {
    const input = CreateTeamInput.parse(req.body);
    const team = await prisma.team.create({
      data: { name: input.name, leadId: input.leadId ?? null },
    });
    await audit({ actorId: req.user!.id, action: 'team.create', entity: 'Team', entityId: team.id });
    res.status(201).json(team);
  }),
);

// PATCH /agents/teams/:id — edit a team.
agentsRouter.patch(
  '/teams/:id',
  requirePermission('agent:write'),
  asyncHandler(async (req, res) => {
    const input = UpdateTeamInput.parse(req.body);
    const existing = await prisma.team.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('Team not found');
    const team = await prisma.team.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.leadId !== undefined ? { leadId: input.leadId } : {}),
      },
    });
    await audit({ actorId: req.user!.id, action: 'team.update', entity: 'Team', entityId: team.id });
    res.json(team);
  }),
);
