import type { Role } from './types';

/**
 * Permission model. Keep this the single source of truth for "who can do what".
 * The API guards routes with `can(role, permission)` and the web hides nav the
 * same way, so the two never drift.
 */
export const PERMISSIONS = [
  // Interactions / calls
  'interaction:read:all', // see every team's calls
  'interaction:read:team', // see own team's calls
  'interaction:read:own', // agent: see only their own calls
  'interaction:create', // manually add a call by pasting a recording link
  // Evaluations
  'evaluation:read',
  'evaluation:review', // confirm/override an AI verdict
  'evaluation:dispute', // agent raises a dispute
  'evaluation:resolve_dispute',
  // Scorecards (the quality guidelines)
  'scorecard:read',
  'scorecard:write',
  // Agents / teams
  'agent:read',
  'agent:write',
  // Users / admin
  'user:manage',
  // Dashboards
  'dashboard:read:all',
  'dashboard:read:team',
  'dashboard:read:own',
  // Ingestion controls
  'ingest:trigger',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [...PERMISSIONS],
  QA_MANAGER: [
    'interaction:read:all',
    'interaction:create',
    'evaluation:read',
    'evaluation:review',
    'evaluation:resolve_dispute',
    'scorecard:read',
    'scorecard:write',
    'agent:read',
    'agent:write',
    'dashboard:read:all',
    'ingest:trigger',
  ],
  QA_ANALYST: [
    'interaction:read:all',
    'interaction:create',
    'evaluation:read',
    'evaluation:review',
    'scorecard:read',
    'agent:read',
    'dashboard:read:all',
  ],
  TEAM_LEAD: [
    'interaction:read:team',
    'evaluation:read',
    'evaluation:resolve_dispute',
    'scorecard:read',
    'agent:read',
    'dashboard:read:team',
  ],
  AGENT: [
    'interaction:read:own',
    'evaluation:read',
    'evaluation:dispute',
    'scorecard:read',
    'dashboard:read:own',
  ],
};

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/** Data-scope helper: how broadly can this role see interactions/dashboards? */
export function dataScope(role: Role): 'all' | 'team' | 'own' {
  if (can(role, 'interaction:read:all')) return 'all';
  if (can(role, 'interaction:read:team')) return 'team';
  return 'own';
}
