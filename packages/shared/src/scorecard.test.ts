import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, type CriterionInput, type ScoreConfig } from './scorecard';

const weighted: ScoreConfig = { mode: 'WEIGHTED', passThreshold: 0.8, startingScore: 100 };
const deduction: ScoreConfig = { mode: 'DEDUCTION', passThreshold: 0.9, startingScore: 100 };

function c(p: Partial<CriterionInput>): CriterionInput {
  return { weight: 1, deduction: 0, autoFail: false, verdict: 'PASS', ...p };
}

// ── WEIGHTED ────────────────────────────────────────────────────────────────
test('weighted: auto-fail dominates even with high score', () => {
  const r = computeVerdict(
    [c({ verdict: 'PASS' }), c({ verdict: 'PASS' }), c({ autoFail: true, verdict: 'FAIL' })],
    { ...weighted, passThreshold: 0.8 },
  );
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.autoFailTriggered, true);
});

test('weighted: threshold pass', () => {
  const r = computeVerdict([c({ weight: 3, verdict: 'PASS' }), c({ weight: 1, verdict: 'FAIL' })], {
    ...weighted,
    passThreshold: 0.7,
  });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.score, 0.75);
});

test('weighted: NA excluded from denominator', () => {
  const r = computeVerdict([c({ verdict: 'PASS' }), c({ verdict: 'NA' })], { ...weighted, passThreshold: 0.9 });
  assert.equal(r.score, 1);
  assert.equal(r.verdict, 'PASS');
});

// ── DEDUCTION ─────────────────────────────────────────────────────────────
test('deduction: no mistakes => full score, pass', () => {
  const r = computeVerdict([c({}), c({})], deduction);
  assert.equal(r.points, 100);
  assert.equal(r.score, 1);
  assert.equal(r.verdict, 'PASS');
});

test('deduction: non-fatal mistakes subtract points', () => {
  const r = computeVerdict(
    [c({ deduction: 5, verdict: 'FAIL' }), c({ deduction: 10, verdict: 'FAIL' }), c({ verdict: 'PASS' })],
    deduction,
  );
  assert.equal(r.points, 85); // 100 - 5 - 10
  assert.equal(r.verdict, 'FAIL'); // 0.85 < 0.9
});

test('deduction: within threshold passes', () => {
  const r = computeVerdict([c({ deduction: 5, verdict: 'FAIL' })], deduction);
  assert.equal(r.points, 95);
  assert.equal(r.verdict, 'PASS'); // 0.95 >= 0.9
});

test('deduction: fatal mistake forces score 0', () => {
  const r = computeVerdict(
    [c({ deduction: 5, verdict: 'FAIL' }), c({ autoFail: true, verdict: 'FAIL' })],
    deduction,
  );
  assert.equal(r.points, 0);
  assert.equal(r.score, 0);
  assert.equal(r.verdict, 'FAIL');
  assert.equal(r.autoFailTriggered, true);
});

test('deduction: score clamps at 0, never negative', () => {
  const r = computeVerdict([c({ deduction: 200, verdict: 'FAIL' })], deduction);
  assert.equal(r.points, 0);
});
