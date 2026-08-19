import type { CriterionVerdict, Verdict } from './types';

/**
 * Pure verdict logic — no I/O, fully unit-testable. Used by the scoring engine
 * (to compute the AI verdict) and by the API (to recompute a final verdict
 * after a human overrides individual criteria).
 *
 * A Criterion represents a QA rule / potential mistake. Its verdict means:
 *   PASS = compliant (rule met / mistake NOT committed)
 *   FAIL = rule broken / mistake committed
 *   NA   = not applicable to this call
 *
 * Two scoring modes (see Scorecard.scoringMode):
 *   DEDUCTION — start at `startingScore`, subtract each committed mistake's
 *     `deduction`; any fatal (autoFail) mistake forces the score to 0. This is
 *     the standard fatal/non-fatal call-center QA form.
 *   WEIGHTED — score = earned weight / applicable weight (NA excluded); any
 *     fatal FAIL forces an overall FAIL.
 *
 * In both modes, `score` is returned as a normalized fraction 0..1 and the call
 * PASSes iff score >= passThreshold (and no fatal was triggered).
 */
export type ScoringMode = 'DEDUCTION' | 'WEIGHTED';

export interface CriterionInput {
  weight: number;
  deduction: number;
  autoFail: boolean;
  verdict: CriterionVerdict;
}

export interface ScoreConfig {
  mode: ScoringMode;
  passThreshold: number; // 0..1
  startingScore: number; // DEDUCTION mode base (e.g. 100)
}

export interface VerdictResult {
  verdict: Verdict;
  /** Normalized 0..1 (or null when nothing was applicable in WEIGHTED mode). */
  score: number | null;
  /** DEDUCTION mode: absolute points remaining (0..startingScore). */
  points: number | null;
  autoFailTriggered: boolean;
}

export function computeVerdict(criteria: CriterionInput[], config: ScoreConfig): VerdictResult {
  const autoFailTriggered = criteria.some((c) => c.autoFail && c.verdict === 'FAIL');

  if (config.mode === 'DEDUCTION') {
    const base = config.startingScore || 100;
    let points = base;
    for (const c of criteria) {
      if (c.verdict === 'FAIL' && !c.autoFail) points -= c.deduction;
    }
    if (autoFailTriggered) points = 0;
    points = Math.max(0, points);
    const score = base > 0 ? points / base : 0;
    const verdict: Verdict = !autoFailTriggered && score >= config.passThreshold ? 'PASS' : 'FAIL';
    return { verdict, score, points, autoFailTriggered };
  }

  // WEIGHTED
  if (autoFailTriggered) {
    return { verdict: 'FAIL', score: weightedScore(criteria), points: null, autoFailTriggered: true };
  }
  const score = weightedScore(criteria);
  const verdict: Verdict = score === null ? 'PASS' : score >= config.passThreshold ? 'PASS' : 'FAIL';
  return { verdict, score, points: null, autoFailTriggered: false };
}

function weightedScore(criteria: CriterionInput[]): number | null {
  let earned = 0;
  let applicable = 0;
  for (const c of criteria) {
    if (c.verdict === 'NA') continue;
    applicable += c.weight;
    if (c.verdict === 'PASS') earned += c.weight;
  }
  if (applicable === 0) return null;
  return earned / applicable;
}
