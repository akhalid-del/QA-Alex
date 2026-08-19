import type { Utterance } from '@qa/shared/types';
import { mapSpeakers, utterancesToText, type RawUtterance } from './map';

const API = 'https://api.assemblyai.com/v2';

// Default PII entities to redact from call recordings.
const PII_POLICIES = [
  'account_number',
  'credit_card_number',
  'credit_card_cvv',
  'date_of_birth',
  'email_address',
  'phone_number',
  'us_social_security_number',
  'banking_information',
];

export interface TranscriptResult {
  providerRef: string;
  fullText: string;
  utterances: Utterance[];
  redactionApplied: boolean;
  audioDurationSec?: number;
}

export interface TranscribeOptions {
  direction: 'INBOUND' | 'OUTBOUND';
  redactPii?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface TranscriptStatus {
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  text?: string;
  utterances?: RawUtterance[];
  audioDurationSec?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AssemblyAI transcription adapter. Supports both the blocking flow (upload/
 * submit + poll to completion, used by the worker's queue job) and a
 * non-blocking submit + single-status-check pair (used by the API's manual
 * "add a call" flow, which advances one step per request to stay inside
 * serverless function time limits — see apps/api/src/routes/interactions.ts).
 */
export class AssemblyAIClient {
  constructor(private apiKey: string) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { authorization: this.apiKey, ...extra };
  }

  /** Upload raw audio bytes, returns an AssemblyAI upload URL. */
  async upload(bytes: Uint8Array): Promise<string> {
    const res = await fetch(`${API}/upload`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/octet-stream' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: bytes as any, // avoids depending on the DOM lib's BodyInit type, which isn't present in every consumer's tsconfig
    });
    if (!res.ok) throw new Error(`AssemblyAI upload failed: ${res.status} ${await safeText(res)}`);
    const json = (await res.json()) as { upload_url: string };
    return json.upload_url;
  }

  /** Create a transcript job for a (publicly fetchable) audio URL. Returns immediately — does not wait for completion. */
  async submitUrl(audioUrl: string, opts: { redactPii?: boolean } = {}): Promise<string> {
    const redact = opts.redactPii ?? true;
    const res = await fetch(`${API}/transcript`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        ...(redact ? { redact_pii: true, redact_pii_policies: PII_POLICIES, redact_pii_audio: false } : {}),
      }),
    });
    if (!res.ok) throw new Error(`AssemblyAI create failed: ${res.status} ${await safeText(res)}`);
    const created = (await res.json()) as { id: string };
    return created.id;
  }

  /** Single status check — does not poll or wait. */
  async getStatus(id: string): Promise<TranscriptStatus> {
    const res = await fetch(`${API}/transcript/${id}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`AssemblyAI status check failed: ${res.status}`);
    const t = (await res.json()) as {
      status: TranscriptStatus['status'];
      error?: string;
      text?: string;
      utterances?: RawUtterance[];
      audio_duration?: number;
    };
    return { status: t.status, error: t.error, text: t.text, utterances: t.utterances, audioDurationSec: t.audio_duration };
  }

  async transcribeBytes(bytes: Uint8Array, opts: TranscribeOptions): Promise<TranscriptResult> {
    const uploadUrl = await this.upload(bytes);
    return this.transcribeUrl(uploadUrl, opts);
  }

  /** Submit + poll to completion (blocking). Used by the worker's queue job. */
  async transcribeUrl(audioUrl: string, opts: TranscribeOptions): Promise<TranscriptResult> {
    const redact = opts.redactPii ?? true;
    const id = await this.submitUrl(audioUrl, { redactPii: redact });

    const interval = opts.pollIntervalMs ?? 4000;
    const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() > deadline) throw new Error(`AssemblyAI transcript ${id} timed out`);
      await sleep(interval);
      const t = await this.getStatus(id);
      if (t.status === 'error') throw new Error(`AssemblyAI transcription error: ${t.error}`);
      if (t.status === 'completed') {
        const utterances = mapSpeakers(t.utterances ?? [], opts.direction);
        return {
          providerRef: id,
          fullText: t.text ?? utterancesToText(utterances),
          utterances,
          redactionApplied: redact,
          audioDurationSec: t.audioDurationSec,
        };
      }
      // queued / processing → keep polling
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
