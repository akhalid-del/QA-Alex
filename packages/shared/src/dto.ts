import { z } from 'zod';
import { CALL_DIRECTIONS, CRITERION_VERDICTS, ROLES } from './types';

/** Manually add a call by pasting a recording link */
export const ManualInteractionInput = z.object({
  recordingUrl: z.string().url(),
  agentId: z.string().optional(),
  queue: z.string().max(100).optional(),
  direction: z.enum(CALL_DIRECTIONS).default('OUTBOUND'),
  agentDisposition: z.string().max(100).optional(),
  startedAt: z.string().optional(),
  durationSec: z.number().int().min(0).optional(),
});
export type ManualInteractionInput = z.infer<typeof ManualInteractionInput>;

/** Auth */
export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Scorecards */
export const CriterionInputDto = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  guidance: z.string().max(4000).default(''),
  category: z.string().max(100).default('General'),
  weight: z.number().int().min(0).max(100).default(1),
  deduction: z.number().int().min(0).max(100).default(0),
  autoFail: z.boolean().default(false),
  order: z.number().int().default(0),
});
export type CriterionInputDto = z.infer<typeof CriterionInputDto>;

export const ScorecardInput = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  scoringMode: z.enum(['DEDUCTION', 'WEIGHTED']).default('DEDUCTION'),
  startingScore: z.number().int().min(1).max(1000).default(100),
  passThreshold: z.number().min(0).max(1).default(0.9),
  referenceScript: z.string().max(20000).default(''),
  dispositionRules: z.string().max(8000).default(''),
  criteria: z.array(CriterionInputDto).min(1),
});
export type ScorecardInput = z.infer<typeof ScorecardInput>;

/** Review: analyst confirms or overrides an evaluation */
export const CriterionReviewDto = z.object({
  criterionResultId: z.string(),
  verdict: z.enum(CRITERION_VERDICTS),
  note: z.string().max(2000).optional(),
});

export const ReviewInput = z.object({
  criteria: z.array(CriterionReviewDto).default([]),
  note: z.string().max(4000).optional(),
});
export type ReviewInput = z.infer<typeof ReviewInput>;

/** Dispute */
export const DisputeInput = z.object({
  reason: z.string().min(1).max(4000),
});
export type DisputeInput = z.infer<typeof DisputeInput>;

export const ResolveDisputeInput = z.object({
  status: z.enum(['UPHELD', 'OVERTURNED']),
  resolution: z.string().max(4000).optional(),
});
export type ResolveDisputeInput = z.infer<typeof ResolveDisputeInput>;

/** Interaction list filters */
export const InteractionQuery = z.object({
  status: z.string().optional(),
  agentId: z.string().optional(),
  teamId: z.string().optional(),
  queue: z.string().optional(),
  verdict: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type InteractionQuery = z.infer<typeof InteractionQuery>;

/** User creation (admin) */
export const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(ROLES),
  teamId: z.string().optional().nullable(),
  agentId: z.string().optional().nullable(),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  teamId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** Agents (manual management) */
export const CreateAgentInput = z.object({
  // Optional during testing / before RingCX access: if blank, the API
  // generates a placeholder RingCX id and derives a username from the name.
  rcAgentId: z.string().optional(),
  username: z.string().optional(),
  name: z.string().min(1),
  teamId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;

export const UpdateAgentInput = z.object({
  username: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  teamId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

/** Teams (manual management) */
export const CreateTeamInput = z.object({
  name: z.string().min(1),
  leadId: z.string().nullable().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

export const UpdateTeamInput = z.object({
  name: z.string().min(1).optional(),
  leadId: z.string().nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamInput>;
