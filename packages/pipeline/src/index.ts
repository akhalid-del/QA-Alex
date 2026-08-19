import { Queue } from 'bullmq';
// Named import (not default) so this compiles under any esModuleInterop
// setting — Vercel's function compiler is stricter than our local tsconfig.
import { Redis } from 'ioredis';

/**
 * Shared BullMQ queue layer. Both the API (to enqueue work) and the worker
 * (to process it) import from here so queue names + job shapes never drift.
 *
 * Connection is lazy (lazyConnect) so importing this module doesn't open a
 * Redis socket until a job is actually enqueued or a worker starts.
 */

export const QUEUE_NAMES = {
  ingest: 'ingest',
  transcribe: 'transcribe',
  score: 'score',
} as const;

// Job payloads
export interface IngestPollJob {
  /** ISO window to scan; omit to auto-derive from now - lag. */
  windowStartISO?: string;
  windowEndISO?: string;
}
export interface TranscribeJob {
  interactionId: string;
}
export interface ScoreJob {
  interactionId: string;
  /** Optional explicit scorecard; defaults to the active one. */
  scorecardId?: string;
}

let _connection: Redis | null = null;
export function getConnection(): Redis {
  if (!_connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    _connection = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return _connection;
}

let _queues: {
  ingest: Queue<IngestPollJob>;
  transcribe: Queue<TranscribeJob>;
  score: Queue<ScoreJob>;
} | null = null;

export function getQueues() {
  if (!_queues) {
    const connection = getConnection();
    _queues = {
      ingest: new Queue<IngestPollJob>(QUEUE_NAMES.ingest, { connection }),
      transcribe: new Queue<TranscribeJob>(QUEUE_NAMES.transcribe, { connection }),
      score: new Queue<ScoreJob>(QUEUE_NAMES.score, { connection }),
    };
  }
  return _queues;
}

const defaultJobOpts = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export async function enqueueTranscribe(job: TranscribeJob): Promise<void> {
  await getQueues().transcribe.add('transcribe', job, {
    ...defaultJobOpts,
    jobId: `transcribe:${job.interactionId}`, // idempotent per interaction
  });
}

export async function enqueueScore(job: ScoreJob): Promise<void> {
  await getQueues().score.add('score', job, {
    ...defaultJobOpts,
    jobId: `score:${job.interactionId}`,
  });
}

/** Trigger a one-off ingest poll immediately. */
export async function enqueueIngestPoll(job: IngestPollJob = {}): Promise<void> {
  await getQueues().ingest.add('poll', job, { ...defaultJobOpts, attempts: 3 });
}

/** Register the repeatable ingest poll (call once on worker startup). */
export async function scheduleIngestPolling(everyMinutes: number): Promise<void> {
  await getQueues().ingest.add(
    'poll',
    {},
    {
      repeat: { every: everyMinutes * 60_000 },
      jobId: 'ingest-poll-repeat',
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );
}

export async function closePipeline(): Promise<void> {
  if (_queues) {
    await Promise.all([_queues.ingest.close(), _queues.transcribe.close(), _queues.score.close()]);
    _queues = null;
  }
  if (_connection) {
    _connection.disconnect();
    _connection = null;
  }
}
