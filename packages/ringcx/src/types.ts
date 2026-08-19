/** Normalized RingCX call segment (one recordable leg of an interaction). */
export interface RcSegment {
  dialogId: string;
  segmentId: string;
  agentId?: string;
  agentUsername?: string;
  agentName?: string;
  queue?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  ani?: string;
  dnis?: string;
  startedAt: string; // ISO 8601
  durationSec: number;
}

export interface RingCxConfig {
  serverUrl: string; // platform.ringcentral.com (auth)
  engageUrl: string; // engage.ringcentral.com (metadata + recordings)
  clientId: string;
  clientSecret: string;
  jwt: string;
  accountId: string;
  subAccountId: string;
}

export class RingCxRateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`RingCX rate limited; retry after ${retryAfterSec}s`);
  }
}

export class RingCxError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
