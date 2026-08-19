import { dataScope, type AuthUser } from '@qa/shared';
import type { Prisma } from '@qa/db';

/**
 * Builds a Prisma `where` fragment restricting Interaction visibility to what
 * the user's role allows: all calls, their team's calls, or only their own.
 * The single source of truth for data-scoping across interaction/dashboard
 * queries.
 */
export function interactionScopeWhere(user: AuthUser): Prisma.InteractionWhereInput {
  const scope = dataScope(user.role);
  if (scope === 'all') return {};
  if (scope === 'team') {
    return user.teamId ? { agent: { teamId: user.teamId } } : { id: '__none__' };
  }
  // own
  return user.agentId ? { agentId: user.agentId } : { id: '__none__' };
}
