import type { Speaker, Utterance } from '@qa/shared/types';

export interface RawUtterance {
  speaker: string; // AssemblyAI label, e.g. "A" / "B"
  start: number; // ms
  end: number; // ms
  text: string;
}

/**
 * Map AssemblyAI speaker labels to AGENT / CUSTOMER using call direction:
 * on an OUTBOUND call the agent speaks first; on INBOUND the customer does.
 * The first distinct label becomes the initiator, the second the other party,
 * any further labels are UNKNOWN. Pure + unit-tested.
 */
export function mapSpeakers(raw: RawUtterance[], direction: 'INBOUND' | 'OUTBOUND'): Utterance[] {
  const initiator: Speaker = direction === 'OUTBOUND' ? 'AGENT' : 'CUSTOMER';
  const other: Speaker = initiator === 'AGENT' ? 'CUSTOMER' : 'AGENT';

  const labelToSpeaker = new Map<string, Speaker>();
  for (const u of raw) {
    if (!labelToSpeaker.has(u.speaker)) {
      const idx = labelToSpeaker.size;
      labelToSpeaker.set(u.speaker, idx === 0 ? initiator : idx === 1 ? other : 'UNKNOWN');
    }
  }

  return raw.map((u) => ({
    speaker: labelToSpeaker.get(u.speaker) ?? 'UNKNOWN',
    startMs: Math.round(u.start),
    endMs: Math.round(u.end),
    text: u.text,
  }));
}

export function utterancesToText(utterances: Utterance[]): string {
  return utterances.map((u) => `${u.speaker}: ${u.text}`).join('\n');
}
