import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from './env';

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});

export async function putRecording(key: string, body: Uint8Array): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: config.S3_BUCKET, Key: key, Body: body, ContentType: 'audio/wav' }),
  );
}

export async function getRecording(key: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty recording body for key ${key}`);
  return bytes;
}
