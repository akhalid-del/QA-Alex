/**
 * Domain types shared across the platform. These mirror the Prisma models
 * but stay dependency-free so the web app (and other packages) can import them
 * without pulling in the Prisma client.
 */

export const ROLES = ['ADMIN', 'QA_MANAGER', 'QA_ANALYST', 'TEAM_LEAD', 'AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const INTERACTION_STATUSES = [
  'INGESTED',
  'TRANSCRIBING',
  'TRANSCRIBED',
  'SCORING',
  'SCORED',
  'REVIEWED',
  'FAILED',
] as const;
export type InteractionStatus = (typeof INTERACTION_STATUSES)[number];

export const CALL_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

/** The dispositions an agent can record on a call (from the IHG/HICV rulebook). */
export const DISPOSITIONS = [
  'Successful Transfer',
  'Failed Transfer',
  'Attempt',
  'Incomplete Survey',
  'Wrong Number',
  'DNC',
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const VERDICTS = ['PASS', 'FAIL'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CRITERION_VERDICTS = ['PASS', 'FAIL', 'NA'] as const;
export type CriterionVerdict = (typeof CRITERION_VERDICTS)[number];

export const SPEAKERS = ['AGENT', 'CUSTOMER', 'UNKNOWN'] as const;
export type Speaker = (typeof SPEAKERS)[number];

export const DISPUTE_STATUSES = ['OPEN', 'UPHELD', 'OVERTURNED'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export interface Utterance {
  speaker: Speaker;
  startMs: number;
  endMs: number;
  text: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  agentId: string | null;
}
