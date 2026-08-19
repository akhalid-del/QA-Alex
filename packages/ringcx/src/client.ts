import { parseInteractionMetadata } from './parse';
import { RingCxError, RingCxRateLimitError, type RcSegment, type RingCxConfig } from './types';

/**
 * Minimal RingCX (RingCentral Contact Center) API client.
 *
 * Auth: JWT service-account → OAuth access token (cached, auto-refreshed).
 * Data: interaction-metadata (discover calls) + recording download (binary WAV).
 *
 * See packages memory / plan for endpoint details and the 2-req/min metadata
 * rate limit (handled here by throwing RingCxRateLimitError on HTTP 429 so the
 * queue can back off).
 */
export class RingCxClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0; // epoch ms

  constructor(private cfg: RingCxConfig) {}

  private async getToken(): Promise<string> {
    // Refresh 60s before expiry.
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: this.cfg.jwt,
    });
    const res = await fetch(`${this.cfg.serverUrl}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) {
      throw new RingCxError(res.status, `Token request failed: ${res.status} ${await safeText(res)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private base(): string {
    return `${this.cfg.engageUrl}/voice/api/cx/integration/v1/accounts/${this.cfg.accountId}/sub-accounts/${this.cfg.subAccountId}`;
  }

  /** Discover call segments in a time window. */
  async getInteractionMetadata(windowStart: Date, windowEnd: Date): Promise<RcSegment[]> {
    const token = await this.getToken();
    const res = await fetch(`${this.base()}/interaction-metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        startTime: windowStart.toISOString(),
        endTime: windowEnd.toISOString(),
      }),
    });
    if (res.status === 429) {
      throw new RingCxRateLimitError(Number(res.headers.get('retry-after') ?? 30));
    }
    if (!res.ok) {
      throw new RingCxError(res.status, `interaction-metadata failed: ${res.status} ${await safeText(res)}`);
    }
    return parseInteractionMetadata(await res.json());
  }

  /** Download a recording as raw bytes (WAV). */
  async downloadRecording(dialogId: string, segmentId: string): Promise<Uint8Array> {
    const token = await this.getToken();
    const res = await fetch(`${this.base()}/recordings/dialogs/${dialogId}/segments/${segmentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429) {
      throw new RingCxRateLimitError(Number(res.headers.get('retry-after') ?? 30));
    }
    if (!res.ok) {
      throw new RingCxError(res.status, `recording download failed: ${res.status} ${await safeText(res)}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
