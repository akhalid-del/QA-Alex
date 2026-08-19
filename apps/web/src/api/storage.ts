import { createClient } from '@supabase/supabase-js';
import { api } from './client';

/**
 * Uploads a recording file directly to Supabase Storage (browser → Storage),
 * bypassing the API's ~4.5MB request-body limit so real call recordings of any
 * size work. Returns the public URL to hand to the transcription pipeline.
 *
 * Flow: ask the API for a signed upload URL → upload straight to Storage → the
 * public URL becomes the call's recording link.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function uploadConfigured(): boolean {
  return Boolean(url && anon);
}

export async function uploadRecording(file: File): Promise<string> {
  if (!uploadConfigured()) throw new Error('Uploads are not configured (missing Supabase settings).');
  const supabase = createClient(url!, anon!, { auth: { persistSession: false } });

  const { path, token, publicUrl } = await api.post<{ path: string; token: string; publicUrl: string }>(
    '/interactions/recordings/sign',
    { filename: file.name },
  );

  const { error } = await supabase.storage.from('recordings').uploadToSignedUrl(path, token, file);
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return publicUrl;
}
