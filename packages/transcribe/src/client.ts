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
}

export interface TranscribeOptions {
  direction: 'INBOUND' | 'OUTBOUND';
  redactPii?: boolean;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * AssemblyAI transcription adapter. Uploads the recording bytes, requests
 * speaker diarization + PII redaction, polls until complete, and returns a
 * normalized transcript with AGENT/CUSTOMER-labelled utterances.
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
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`AssemblyAI upload failed: ${res.status} ${await safeText(res)}`);
    const json = (await res.json()) as { upload_url: string };
    return json.upload_url;
  }

  async transcribeBytes(bytes: Uint8Array, opts: TranscribeOptions): Promise<TranscriptResult> {
    const uploadUrl = await this.upload(bytes);
    return this.transcribeUrl(uploadUrl, opts);
  }

  async transcribeUrl(audioUrl: string, opts: TranscribeOptions): Promise<TranscriptResult> {
    const redact = opts.redactPii ?? true;
    const createRes = await fetch(`${API}/transcript`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        audio_url: audioUrl,
        speaker_labels: true,
        ...(redact ? { redact_pii: true, redact_pii_policies: PII_POLICIES, redact_pii_audio: false } : {}),
      }),
    });
    if (!createRes.ok) {
      throw new Error(`AssemblyAI create failed: ${createRes.status} ${await safeText(createRes)}`);
    }
    const created = (await createRes.json()) as { id: string };
    const id = created.id;

    const interval = opts.pollIntervalMs ?? 4000;
    const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() > deadline) throw new Error(`AssemblyAI transcript ${id} timed out`);
      await sleep(interval);
      const pollRes = await fetch(`${API}/transcript/${id}`, { headers: this.headers() });
      if (!pollRes.ok) throw new Error(`AssemblyAI poll failed: ${pollRes.status}`);
      const t = (await pollRes.json()) as {
        status: string;
        error?: string;
        text?: string;
        utterances?: RawUtterance[];
      };
      if (t.status === 'error') throw new Error(`AssemblyAI transcription error: ${t.error}`);
      if (t.status === 'completed') {
        const utterances = mapSpeakers(t.utterances ?? [], opts.direction);
        return {
          providerRef: id,
          fullText: t.text ?? utterancesToText(utterances),
          utterances,
          redactionApplied: redact,
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
