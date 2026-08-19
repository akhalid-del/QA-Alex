import jwt from 'jsonwebtoken';
import type { AuthUser } from '@qa/shared';
import { config } from '../env';

export function signToken(user: AuthUser): string {
  const options = { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions;
  return jwt.sign(user, config.JWT_SECRET, options);
}

export function verifyToken(token: string): AuthUser {
  const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload & AuthUser;
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role,
    teamId: decoded.teamId ?? null,
    agentId: decoded.agentId ?? null,
  };
}
