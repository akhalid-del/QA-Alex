import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSpeakers, utterancesToText } from './map';

const raw = [
  { speaker: 'A', start: 0, end: 1000, text: 'Hello, am I speaking to Mr. Lee?' },
  { speaker: 'B', start: 1200, end: 2000, text: 'Yes, this is Jordan.' },
  { speaker: 'A', start: 2200, end: 3000, text: 'Great.' },
];

test('outbound: first speaker is the AGENT', () => {
  const out = mapSpeakers(raw, 'OUTBOUND');
  assert.equal(out[0]!.speaker, 'AGENT');
  assert.equal(out[1]!.speaker, 'CUSTOMER');
  assert.equal(out[2]!.speaker, 'AGENT');
});

test('inbound: first speaker is the CUSTOMER', () => {
  const out = mapSpeakers(raw, 'INBOUND');
  assert.equal(out[0]!.speaker, 'CUSTOMER');
  assert.equal(out[1]!.speaker, 'AGENT');
});

test('third distinct speaker is UNKNOWN', () => {
  const out = mapSpeakers([...raw, { speaker: 'C', start: 4000, end: 4500, text: 'Hi' }], 'OUTBOUND');
  assert.equal(out[3]!.speaker, 'UNKNOWN');
});

test('utterancesToText formats speaker-prefixed lines', () => {
  const text = utterancesToText(mapSpeakers(raw, 'OUTBOUND'));
  assert.match(text, /^AGENT: Hello/);
  assert.match(text, /CUSTOMER: Yes/);
});
