import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { LoginInput, permissionsFor, type AuthUser } from '@qa/shared';
import { prisma } from '@qa/db';
import { asyncHandler, unauthorized } from '../lib/http';
import { signToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = LoginInput.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) throw unauthorized('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials');

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      teamId: user.teamId,
      agentId: user.agentId,
    };
    const token = signToken(authUser);
    res.json({ token, user: authUser, permissions: permissionsFor(user.role) });
  }),
);

// Returns the current user + their permissions (for the SPA to gate nav).
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    res.json({ user, permissions: permissionsFor(user.role) });
  }),
);
