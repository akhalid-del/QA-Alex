import { Router } from 'express';
import { CreateAgentInput, CreateTeamInput, UpdateAgentInput, UpdateTeamInput } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';

export const agentsRouter = Router();
agentsRouter.use(authenticate);

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
    // During testing there's no real RingCX id yet: derive a slug from the
    // name and generate placeholders so agents can be added by name alone.
    const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '') || 'agent';
    const rcAgentId = input.rcAgentId?.trim() || `demo-${slug}-${Math.random().toString(36).slice(2, 7)}`;
    const username = input.username?.trim() || slug;
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
