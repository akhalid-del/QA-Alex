import { Worker } from 'bullmq';
import { hasRingCxCreds } from '@qa/shared';
import { prisma } from '@qa/db';
import {
  QUEUE_NAMES,
  getConnection,
  scheduleIngestPolling,
  closePipeline,
  type IngestPollJob,
  type ScoreJob,
  type TranscribeJob,
} from '@qa/pipeline';
import { config } from './env';
import { runIngestPoll } from './processors/ingest';
import { runTranscribe } from './processors/transcribe';
import { runScore } from './processors/score';

const POLL_EVERY_MINUTES = 5;
const connection = getConnection();

// RingCX metadata endpoint is capped ~2 req/min → limit + single concurrency.
const ingestWorker = new Worker<IngestPollJob>(QUEUE_NAMES.ingest, (job) => runIngestPoll(job.data), {
  connection,
  concurrency: 1,
  limiter: { max: 2, duration: 60_000 },
});

const transcribeWorker = new Worker<TranscribeJob>(QUEUE_NAMES.transcribe, (job) => runTranscribe(job.data), {
  connection,
  concurrency: 4,
});

const scoreWorker = new Worker<ScoreJob>(QUEUE_NAMES.score, (job) => runScore(job.data), {
  connection,
  concurrency: 4,
});

for (const [name, w] of [
  ['ingest', ingestWorker],
  ['transcribe', transcribeWorker],
  ['score', scoreWorker],
] as const) {
  w.on('completed', (job) => console.log(`[${name}] job ${job.id} completed`));
  w.on('failed', (job, err) => console.error(`[${name}] job ${job?.id} failed:`, err?.message));
  w.on('error', (err) => console.error(`[${name}] worker error:`, err.message));
}

async function main() {
  console.log('Worker starting…');
  console.log(`  RingCX: ${hasRingCxCreds(config) ? 'configured' : 'NOT configured'}`);
  console.log(`  AssemblyAI: ${config.ASSEMBLYAI_API_KEY ? 'configured' : 'NOT configured'}`);
  console.log(`  Claude: ${config.ANTHROPIC_API_KEY ? 'configured' : 'NOT configured'}`);

  if (hasRingCxCreds(config)) {
    await scheduleIngestPolling(POLL_EVERY_MINUTES);
    console.log(`  Ingest poll scheduled every ${POLL_EVERY_MINUTES} min.`);
  } else {
    console.log('  Ingest polling disabled until RingCX credentials are set.');
  }
  console.log('Worker ready. Waiting for jobs.');
}

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down…`);
  await Promise.allSettled([ingestWorker.close(), transcribeWorker.close(), scoreWorker.close()]);
  await closePipeline();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
