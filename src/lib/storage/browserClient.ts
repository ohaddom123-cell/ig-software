"use client";

import { createClient } from "@supabase/supabase-js";

let real: ReturnType<typeof createClient> | null = null;

/**
 * Browser-safe Supabase client — uses only the public anon key (never the
 * service role key, which stays server-only). Used for exactly one thing:
 * completing a direct-to-storage upload via a signed URL the server
 * already generated (see /api/reels/upload-url). Per Supabase's own docs,
 * uploadToSignedUrl needs no RLS/bucket permissions — the token IS the
 * authorization — so the anon key here is just how the client talks to
 * the Storage API at all, not a privilege grant.
 */
function getBrowserStorageClient() {
  if (real) return real;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.");
  }
  real = createClient(url, anonKey);
  return real;
}

export async function uploadFileToSignedUrl(
  bucket: string,
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const client = getBrowserStorageClient();
  const { error } = await client.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
