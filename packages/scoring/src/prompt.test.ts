import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserPrompt, evaluationToolSchema } from './prompt';
import type { ScoringInput } from './types';

const input: ScoringInput = {
  direction: 'OUTBOUND',
  transcriptText: 'AGENT: Hello\nCUSTOMER: Hi',
  agentName: 'Jamie Rivera',
  queue: 'IHG Survey',
  scorecard: {
    name: 'IHG / HICV Survey QA',
    scoringMode: 'DEDUCTION',
    startingScore: 100,
    passThreshold: 0.9,
    referenceScript: 'Hello, am I speaking to (Name)?',
    criteria: [
      { code: 'GREET', title: 'Greeting', guidance: 'Say the greeting', category: 'Opening', weight: 1, deduction: 5, autoFail: false },
      { code: 'FATAL_NO_CONSENT', title: 'Transferred without consent', guidance: 'Must confirm', category: 'Fatal', weight: 1, deduction: 0, autoFail: true },
    ],
  },
};

test('system prompt embeds the script and all criterion codes', () => {
  const p = buildSystemPrompt(input);
  assert.match(p, /Hello, am I speaking to \(Name\)\?/);
  assert.match(p, /GREET —/);
  assert.match(p, /FATAL_NO_CONSENT \[FATAL\]/);
});

test('user prompt includes metadata and transcript', () => {
  const p = buildUserPrompt(input);
  assert.match(p, /Direction: OUTBOUND/);
  assert.match(p, /Agent: Jamie Rivera/);
  assert.match(p, /AGENT: Hello/);
});

test('tool schema enumerates the exact criterion codes', () => {
  const schema = evaluationToolSchema(input.scorecard.criteria.map((c) => c.code));
  const codeEnum = (schema.input_schema.properties.criteria as any).items.properties.code.enum;
  assert.deepEqual(codeEnum, ['GREET', 'FATAL_NO_CONSENT']);
});
