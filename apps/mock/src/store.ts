import {
  computeVerdict,
  permissionsFor,
  type CriterionVerdict,
  type Role,
  type Utterance,
} from '@qa/shared';
import { IHG_HICV_SCORECARD } from '@qa/db/ihg-scorecard';

/**
 * In-memory data for the mock API. Mirrors the real API's response shapes so
 * the web app runs unchanged, but needs no Postgres/Redis. Purpose: UI/UX
 * iteration while the RingCX API is unavailable.
 */

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
  agentId: string | null;
  active: boolean;
}
export interface MockAgent {
  id: string;
  rcAgentId: string;
  username: string;
  name: string;
  teamId: string | null;
  active: boolean;
}
export interface MockTeam {
  id: string;
  name: string;
  leadId: string | null;
  leadName: string | null;
}
interface Criterion {
  id: string;
  code: string;
  title: string;
  guidance: string;
  category: string;
  weight: number;
  deduction: number;
  autoFail: boolean;
  order: number;
}
interface CriterionResult {
  id: string;
  criterionId: string;
  aiVerdict: CriterionVerdict;
  verdict: CriterionVerdict;
  evidenceQuote: string;
  evidenceTimestampMs: number | null;
  aiRationale: string;
  humanOverride: boolean;
}
interface Dispute {
  id: string;
  reason: string;
  status: 'OPEN' | 'UPHELD' | 'OVERTURNED';
  resolution: string | null;
}
interface Review {
  id: string;
  note: string | null;
  reviewer: { id: string; name: string };
  createdAt: string;
}
interface Evaluation {
  id: string;
  aiVerdict: 'PASS' | 'FAIL';
  finalVerdict: 'PASS' | 'FAIL';
  finalScore: number | null;
  autoFailTriggered: boolean;
  summary: string;
  reviewed: boolean;
  scorecardId: string;
  criterionResults: CriterionResult[];
  disputes: Dispute[];
  reviews: Review[];
}
export interface Interaction {
  id: string;
  dialogId: string;
  segmentId: string;
  agentId: string | null;
  queue: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  ani: string | null;
  dnis: string | null;
  startedAt: string;
  durationSec: number;
  sampled: boolean;
  status: string;
  recordingKey: string | null;
  transcript: { utterances: Utterance[]; fullText: string; redactionApplied: boolean } | null;
  evaluation: Evaluation | null;
}
export interface Scorecard {
  id: string;
  name: string;
  description: string;
  version: number;
  active: boolean;
  scoringMode: 'DEDUCTION' | 'WEIGHTED';
  startingScore: number;
  passThreshold: number;
  referenceScript: string;
  criteria: Criterion[];
}

const rnd = () => Math.random();
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;

export const teams: MockTeam[] = [
  { id: 'team-alpha', name: 'Team Alpha', leadId: 'u-lead', leadName: 'Casey Ford' },
  { id: 'team-bravo', name: 'Team Bravo', leadId: null, leadName: null },
];

export const agents: MockAgent[] = [
  { id: 'agent-1', rcAgentId: 'rc-1001', username: 'j.rivera', name: 'Jamie Rivera', teamId: 'team-alpha', active: true },
  { id: 'agent-2', rcAgentId: 'rc-1002', username: 's.patel', name: 'Sam Patel', teamId: 'team-alpha', active: true },
  { id: 'agent-3', rcAgentId: 'rc-1003', username: 'a.okoro', name: 'Ada Okoro', teamId: 'team-alpha', active: true },
  { id: 'agent-4', rcAgentId: 'rc-2001', username: 'm.chen', name: 'Morgan Chen', teamId: 'team-bravo', active: true },
  { id: 'agent-5', rcAgentId: 'rc-2002', username: 'l.gomez', name: 'Luca Gomez', teamId: 'team-bravo', active: true },
];

export const users: MockUser[] = [
  { id: 'u-admin', email: 'admin@sublogical.com', name: 'Alex Khalid', role: 'ADMIN', teamId: null, agentId: null, active: true },
  { id: 'u-mgr', email: 'manager@sublogical.com', name: 'Quinn Morgan', role: 'QA_MANAGER', teamId: null, agentId: null, active: true },
  { id: 'u-analyst', email: 'analyst@sublogical.com', name: 'Riley Stone', role: 'QA_ANALYST', teamId: null, agentId: null, active: true },
  { id: 'u-lead', email: 'lead@sublogical.com', name: 'Casey Ford', role: 'TEAM_LEAD', teamId: 'team-alpha', agentId: null, active: true },
  { id: 'u-agent', email: 'agent@sublogical.com', name: 'Jamie Rivera', role: 'AGENT', teamId: 'team-alpha', agentId: 'agent-1', active: true },
];

export const scorecard: Scorecard = {
  id: 'sc-1',
  name: IHG_HICV_SCORECARD.name,
  description: IHG_HICV_SCORECARD.description,
  version: 1,
  active: true,
  scoringMode: IHG_HICV_SCORECARD.scoringMode,
  startingScore: IHG_HICV_SCORECARD.startingScore,
  passThreshold: IHG_HICV_SCORECARD.passThreshold,
  referenceScript: IHG_HICV_SCORECARD.referenceScript,
  criteria: IHG_HICV_SCORECARD.criteria.map((c, i) => ({
    id: `crit-${c.code}`,
    code: c.code,
    title: c.title,
    guidance: c.guidance,
    category: c.category,
    weight: 1,
    deduction: c.deduction,
    autoFail: c.autoFail,
    order: i,
  })),
};
export const scorecards: Scorecard[] = [scorecard];

const QUEUES = ['IHG Survey - East', 'IHG Survey - West', 'IHG Survey - Central'];

function transcriptFor(agentFirst: string, bias: 'good' | 'bad') {
  const utterances: Utterance[] =
    bias === 'good'
      ? [
          { speaker: 'AGENT', startMs: 0, endMs: 3500, text: `Hello, may I speak with Mr. Jordan Lee? My name is ${agentFirst}, calling on behalf of IHG Hotels & Resorts and the Holiday Inn brand family.` },
          { speaker: 'CUSTOMER', startMs: 3700, endMs: 5200, text: 'Yes, this is Jordan.' },
          { speaker: 'AGENT', startMs: 5400, endMs: 13000, text: 'Thank you for being a loyal IHG One Rewards member. We just want to ask a quick 5 question survey. It’s also an opportunity to receive a special vacation offer as well as 500 IHG One Rewards points. This call may be monitored and recorded. May I begin?' },
          { speaker: 'CUSTOMER', startMs: 13200, endMs: 14500, text: 'Sure.' },
          { speaker: 'AGENT', startMs: 14700, endMs: 20000, text: 'Do you usually stay for business or pleasure?' },
          { speaker: 'CUSTOMER', startMs: 20200, endMs: 21500, text: 'Business, mostly.' },
          { speaker: 'AGENT', startMs: 21700, endMs: 31000, text: 'Thank you. Right now I’m connecting you to Holiday Inn Club Vacations to hear the offer and receive the 500 IHG One Rewards points, and connecting you should only take a quick moment. Please stay on the line.' },
        ]
      : [
          { speaker: 'AGENT', startMs: 0, endMs: 6000, text: 'Hi, is this the account holder? Calling from IHG about a survey.' },
          { speaker: 'CUSTOMER', startMs: 6200, endMs: 7500, text: 'Who is this?' },
          { speaker: 'AGENT', startMs: 7700, endMs: 15000, text: 'You’ll get 500 points just for the survey, it’ll take a second. Let me put you through to Holiday Inn now.' },
          { speaker: 'CUSTOMER', startMs: 15200, endMs: 16500, text: 'Wait, I—' },
          { speaker: 'AGENT', startMs: 16700, endMs: 19000, text: 'Transferring you now.' },
        ];
  return { utterances, fullText: utterances.map((u) => `${u.speaker}: ${u.text}`).join('\n'), redactionApplied: true };
}

let evalSeq = 0;
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60), 0, 0);
  return d.toISOString();
}

export const interactions: Interaction[] = [];

export function seed(count = 45) {
  for (let i = 0; i < count; i++) {
    const agent = pick(agents);
    const sampled = rnd() < 0.6;
    const bias: 'good' | 'bad' = rnd() < 0.8 ? 'good' : 'bad';
    const startedAt = daysAgo(Math.floor(rnd() * 30));

    const interaction: Interaction = {
      id: `int-${i + 1}`,
      dialogId: `dlg-${1000 + i}`,
      segmentId: `seg-${i}`,
      agentId: agent.id,
      queue: pick(QUEUES),
      direction: 'OUTBOUND',
      ani: `+1206555${String(1000 + i).padStart(4, '0')}`,
      dnis: '+18005551234',
      startedAt,
      durationSec: 90 + Math.floor(rnd() * 240),
      sampled,
      status: sampled ? 'SCORED' : 'INGESTED',
      recordingKey: null,
      transcript: null,
      evaluation: null,
    };

    if (sampled) {
      interaction.transcript = transcriptFor(agent.name.split(' ')[0]!, bias);
      const results = scorecard.criteria.map((c) => {
        let verdict: CriterionVerdict;
        if (bias === 'good') {
          // Good calls never commit a fatal mistake; rare minor slip.
          verdict = c.autoFail ? 'PASS' : rnd() < 0.01 ? 'FAIL' : 'PASS';
        } else if (c.autoFail) {
          verdict = rnd() < 0.1 ? 'FAIL' : 'PASS';
        } else {
          verdict = rnd() < 0.08 ? 'FAIL' : 'PASS';
        }
        return { c, verdict };
      });
      const { verdict, score, points, autoFailTriggered } = computeVerdict(
        results.map((r) => ({ weight: r.c.weight, deduction: r.c.deduction, autoFail: r.c.autoFail, verdict: r.verdict })),
        { mode: scorecard.scoringMode, passThreshold: scorecard.passThreshold, startingScore: scorecard.startingScore },
      );
      const reviewed = rnd() < 0.4;
      interaction.evaluation = {
        id: `eval-${++evalSeq}`,
        aiVerdict: verdict,
        finalVerdict: verdict,
        finalScore: score,
        autoFailTriggered,
        reviewed,
        scorecardId: scorecard.id,
        summary:
          verdict === 'PASS'
            ? `Agent followed the survey script and transferred to Holiday Inn Club Vacations correctly. Score ${points}/100.`
            : autoFailTriggered
              ? 'Automatic fail: a fatal transfer/clarity/compliance rule was broken.'
              : `${results.filter((r) => r.verdict === 'FAIL').length} non-fatal script deviation(s). Score ${points}/100.`,
        criterionResults: results.map((r, j) => ({
          id: `cr-${interaction.id}-${j}`,
          criterionId: r.c.id,
          aiVerdict: r.verdict,
          verdict: r.verdict,
          evidenceQuote: r.verdict === 'FAIL' ? (bias === 'bad' ? 'You’ll get 500 points just for the survey.' : '') : '',
          evidenceTimestampMs: 7700,
          aiRationale: r.verdict === 'FAIL' ? 'Transcript indicates this rule was not followed.' : 'No deviation detected for this rule.',
          humanOverride: false,
        })),
        disputes: [],
        reviews: reviewed ? [{ id: `rev-${interaction.id}`, note: 'Confirmed.', reviewer: { id: 'u-analyst', name: 'Riley Stone' }, createdAt: startedAt }] : [],
      };
    }
    interactions.push(interaction);
  }
}

// ── Scope + auth helpers ────────────────────────────────────────────────────
export function userByEmail(email: string): MockUser | undefined {
  return users.find((u) => u.email === email);
}
export function userById(id: string): MockUser | undefined {
  return users.find((u) => u.id === id);
}
export function permsFor(role: Role) {
  return permissionsFor(role);
}

export function visibleInteractions(user: MockUser): Interaction[] {
  if (['ADMIN', 'QA_MANAGER', 'QA_ANALYST'].includes(user.role)) return interactions;
  if (user.role === 'TEAM_LEAD') {
    const teamAgentIds = new Set(agents.filter((a) => a.teamId === user.teamId).map((a) => a.id));
    return interactions.filter((i) => i.agentId && teamAgentIds.has(i.agentId));
  }
  return interactions.filter((i) => i.agentId === user.agentId); // AGENT
}

export function agentName(agentId: string | null): string | null {
  return agents.find((a) => a.id === agentId)?.name ?? null;
}
