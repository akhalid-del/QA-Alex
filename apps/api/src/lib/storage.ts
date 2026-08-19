import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../env';

/**
 * S3-compatible object storage (MinIO locally, AWS S3 in cloud). Recordings are
 * stored here — never in the DB. Objects are private; the API hands out
 * short-lived presigned GET URLs so the browser can stream audio directly.
 */
export const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});

/** Presigned GET URL for a recording, valid for `expiresIn` seconds. */
export async function presignRecordingUrl(key: string, expiresIn = 900): Promise<string | null> {
  // Seeded demo objects don't actually exist in storage — skip signing them.
  if (key.startsWith('demo/')) return null;
  const cmd = new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/** Upload a buffer/stream (used by the ingest worker in Phase 2). */
export async function putRecording(key: string, body: Uint8Array | Buffer): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: 'audio/wav' }),
  );
}
