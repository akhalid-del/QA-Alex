import type { RcSegment } from './types';

/**
 * Defensive normalizer for the interaction-metadata response. The exact field
 * names vary by RingCX account/version, so we probe several common keys and map
 * to our normalized RcSegment. Pure + unit-tested; adjust the key candidates
 * once validated against the live sandbox response.
 */
function first<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v as T;
  }
  return undefined;
}

function toIso(v: unknown): string {
  if (typeof v === 'number') return new Date(v).toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(0).toISOString();
}

/** Extract the array of raw records from whatever envelope the API returns. */
export function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['interactions', 'data', 'records', 'results', 'items', 'metadata']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

export function normalizeSegment(raw: Record<string, unknown>): RcSegment | null {
  const dialogId = first<string | number>(raw, ['dialogId', 'dialog_id', 'dialogID', 'interactionId', 'interaction_id']);
  const segmentId = first<string | number>(raw, ['segmentId', 'segment_id', 'segmentID', 'mediaId', 'media_id']);
  if (dialogId === undefined || segmentId === undefined) return null;

  const dirRaw = String(first<string>(raw, ['direction', 'callDirection', 'call_direction']) ?? 'OUTBOUND').toUpperCase();
  const direction: RcSegment['direction'] = dirRaw.startsWith('IN') ? 'INBOUND' : 'OUTBOUND';

  const durationRaw = first<number | string>(raw, ['duration', 'durationSec', 'duration_seconds', 'talkTime', 'talk_time']);
  const durationSec = durationRaw === undefined ? 0 : Math.round(Number(durationRaw)) || 0;

  return {
    dialogId: String(dialogId),
    segmentId: String(segmentId),
    agentId: first<string | number>(raw, ['agentId', 'agent_id', 'userId', 'user_id'])?.toString(),
    agentUsername: first<string>(raw, ['agentUsername', 'agent_username', 'username', 'login']),
    agentName: first<string>(raw, ['agentName', 'agent_name', 'agentFullName', 'displayName']),
    queue: first<string>(raw, ['queue', 'queueName', 'queue_name', 'skill', 'campaign', 'campaignName']),
    direction,
    ani: first<string>(raw, ['ani', 'ANI', 'callerId', 'from', 'fromNumber']),
    dnis: first<string>(raw, ['dnis', 'DNIS', 'to', 'toNumber', 'dialedNumber']),
    startedAt: toIso(first(raw, ['startTime', 'startedAt', 'start_time', 'timestamp', 'createdAt'])),
    durationSec,
  };
}

export function parseInteractionMetadata(payload: unknown): RcSegment[] {
  return extractRecords(payload)
    .map(normalizeSegment)
    .filter((s): s is RcSegment => s !== null);
}
