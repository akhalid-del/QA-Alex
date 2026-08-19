import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRecords, normalizeSegment, parseInteractionMetadata } from './parse';

test('extractRecords finds the array under common envelope keys', () => {
  assert.equal(extractRecords({ interactions: [{}, {}] }).length, 2);
  assert.equal(extractRecords({ data: [{}] }).length, 1);
  assert.equal(extractRecords([{}, {}, {}]).length, 3);
  assert.equal(extractRecords({ nope: 1 }).length, 0);
});

test('normalizeSegment maps snake_case + camelCase fields', () => {
  const s = normalizeSegment({
    dialog_id: 555,
    segment_id: 'seg-1',
    call_direction: 'inbound',
    agent_username: 'j.rivera',
    queue_name: 'IHG Survey',
    duration: '183',
    startTime: '2026-08-01T10:00:00Z',
    ani: '+12065551000',
  });
  assert.ok(s);
  assert.equal(s!.dialogId, '555');
  assert.equal(s!.segmentId, 'seg-1');
  assert.equal(s!.direction, 'INBOUND');
  assert.equal(s!.agentUsername, 'j.rivera');
  assert.equal(s!.queue, 'IHG Survey');
  assert.equal(s!.durationSec, 183);
  assert.equal(s!.startedAt, '2026-08-01T10:00:00.000Z');
});

test('normalizeSegment returns null without dialog/segment ids', () => {
  assert.equal(normalizeSegment({ foo: 'bar' }), null);
});

test('parseInteractionMetadata filters invalid rows', () => {
  const out = parseInteractionMetadata({
    interactions: [
      { dialogId: 'd1', segmentId: 's1', direction: 'OUTBOUND' },
      { garbage: true },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.direction, 'OUTBOUND');
});
