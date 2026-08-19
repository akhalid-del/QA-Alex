import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { CreateUserInput, UpdateUserInput } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, badRequest, notFound } from '../lib/http';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../lib/audit';

export const usersRouter = Router();
usersRouter.use(authenticate, requirePermission('user:manage'));

usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        teamId: true,
        agentId: true,
        createdAt: true,
      },
    });
    res.json(users);
  }),
);

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = CreateUserInput.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw badRequest('A user with that email already exists');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        role: input.role,
        passwordHash,
        teamId: input.teamId,
        agentId: input.agentId,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    await audit({ actorId: req.user!.id, action: 'user.create', entity: 'User', entityId: user.id });
    res.status(201).json(user);
  }),
);

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const input = UpdateUserInput.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id! } });
    if (!existing) throw notFound('User not found');

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.active !== undefined) data.active = input.active;
    if (input.teamId !== undefined) data.teamId = input.teamId;
    if (input.agentId !== undefined) data.agentId = input.agentId;
    if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

    const user = await prisma.user.update({
      where: { id: existing.id },
      data,
      select: { id: true, email: true, name: true, role: true, active: true, teamId: true, agentId: true },
    });
    await audit({ actorId: req.user!.id, action: 'user.update', entity: 'User', entityId: user.id });
    res.json(user);
  }),
);
