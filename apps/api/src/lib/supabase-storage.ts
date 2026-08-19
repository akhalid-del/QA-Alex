import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../env';

/**
 * Supabase Storage for large recording uploads. The browser uploads the file
 * DIRECTLY to Storage via a short-lived signed upload URL (created here with
 * the service-role key), bypassing the API/Vercel request-body limit entirely.
 * AssemblyAI then fetches the file from its public URL.
 */
let _client: SupabaseClient | null = null;

export function supabaseConfigured(): boolean {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}

function client(): SupabaseClient {
  if (!supabaseConfigured()) throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  if (!_client) {
    _client = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

const SAFE_EXT = /\.(mp3|wav|m4a|mp4|ogg|webm|flac|aac)$/i;

/** Create a signed upload URL the browser can PUT the file to, plus the eventual public URL. */
export async function createRecordingUpload(filename: string): Promise<{ path: string; token: string; publicUrl: string }> {
  const bucket = config.SUPABASE_RECORDINGS_BUCKET;
  const extMatch = filename.match(SAFE_EXT);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.mp3';
  const path = `manual/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

  const { data, error } = await client().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Could not create upload URL: ${error?.message ?? 'unknown'}`);

  const publicUrl = client().storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return { path, token: data.token, publicUrl };
}
