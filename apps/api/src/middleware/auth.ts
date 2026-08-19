import type { NextFunction, Request, Response } from 'express';
import { can, type AuthUser, type Permission } from '@qa/shared';
import { verifyToken } from '../lib/jwt';
import { forbidden, unauthorized } from '../lib/http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Populates req.user from the Bearer token; 401 if missing/invalid. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Missing bearer token');
  }
  try {
    req.user = verifyToken(header.slice('Bearer '.length));
    next();
  } catch {
    throw unauthorized('Invalid or expired token');
  }
}

/** Guard a route by permission. Use after authenticate. */
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!can(req.user.role, permission)) throw forbidden(`Requires permission: ${permission}`);
    next();
  };
}
