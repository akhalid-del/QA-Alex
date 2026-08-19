import { z } from 'zod';

/**
 * Central, validated environment config. Import { loadConfig } in Node
 * processes (api/worker). Fails fast with a clear message if required vars
 * are missing. The web app does NOT use this — it reads import.meta.env.
 */
const boolish = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  VITE_API_URL: z.string().default('http://localhost:4000'),
  // Comma-separated list of allowed origins for CORS. Empty/unset = allow all
  // (fine for local dev; set this in production to your Vercel domain(s)).
  CORS_ORIGIN: z.string().optional(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  DATABASE_URL: z.string().min(1),
  // No default: an unset REDIS_URL is the signal that the queue (Upstash/
  // Railway) isn't wired up yet, so /pipeline routes can fail fast instead
  // of hanging trying to reach localhost on a serverless host.
  REDIS_URL: z.string().optional(),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('recordings'),
  S3_ACCESS_KEY_ID: z.string().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: boolish,

  // Supabase Storage — direct large-file uploads (browser → Storage → AssemblyAI).
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_RECORDINGS_BUCKET: z.string().default('recordings'),

  RC_SERVER_URL: z.string().default('https://platform.ringcentral.com'),
  RC_ENGAGE_URL: z.string().default('https://engage.ringcentral.com'),
  RC_CLIENT_ID: z.string().optional(),
  RC_CLIENT_SECRET: z.string().optional(),
  RC_JWT: z.string().optional(),
  RC_ACCOUNT_ID: z.string().optional(),
  RC_SUBACCOUNT_ID: z.string().optional(),
  RC_INGEST_LAG_MINUTES: z.coerce.number().default(15),
  QA_SAMPLE_PERCENT: z.coerce.number().min(0).max(100).default(20),

  ASSEMBLYAI_API_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-4-8'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

let cached: AppConfig | null = null;

type EnvRecord = Record<string, string | undefined>;

export function loadConfig(env: EnvRecord = (globalThis as { process?: { env: EnvRecord } }).process?.env ?? {}): AppConfig {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when the RingCX credentials needed for live ingestion are present. */
export function hasRingCxCreds(cfg: AppConfig): boolean {
  return Boolean(
    cfg.RC_CLIENT_ID && cfg.RC_CLIENT_SECRET && cfg.RC_JWT && cfg.RC_ACCOUNT_ID && cfg.RC_SUBACCOUNT_ID,
  );
}
