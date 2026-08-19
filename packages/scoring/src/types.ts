import type { CriterionVerdict, ScoringMode, Verdict } from '@qa/shared';

export interface ScoringCriterion {
  code: string;
  title: string;
  guidance: string;
  category: string;
  weight: number;
  deduction: number;
  autoFail: boolean;
}

export interface ScoringScorecard {
  name: string;
  scoringMode: ScoringMode;
  startingScore: number;
  passThreshold: number;
  referenceScript: string;
  criteria: ScoringCriterion[];
}

export interface ScoringInput {
  scorecard: ScoringScorecard;
  direction: 'INBOUND' | 'OUTBOUND';
  transcriptText: string;
  agentName?: string;
  queue?: string;
}

export interface ScoredCriterion {
  code: string;
  verdict: CriterionVerdict;
  evidenceQuote: string;
  evidenceTimestampMs?: number;
  rationale: string;
}

export interface ScoringResult {
  summary: string;
  model: string;
  verdict: Verdict;
  score: number | null;
  points: number | null;
  autoFailTriggered: boolean;
  criteria: ScoredCriterion[];
}
