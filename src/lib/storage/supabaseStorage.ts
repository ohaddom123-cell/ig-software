import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageBucket, StorageProvider } from "./types";

const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

let real: SupabaseClient | null = null;

/**
 * Lazily initialized, same discipline as db/client.ts and lib/anthropic.ts:
 * importing this module must never throw during `next build`'s page-data
 * collection, when SUPABASE_SERVICE_ROLE_KEY legitimately isn't set yet —
 * only an actual call should fail, with a message that says what's missing.
 */
function getClient(): SupabaseClient {
  if (real) return real;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Get the service_role key from " +
        "Supabase dashboard -> Project Settings -> API, and SUPABASE_URL is https://<project-ref>.supabase.co. " +
        "The service role key is a server-only secret — never expose it to the browser.",
    );
  }

  // Server-only client, service role key: this bypasses Row Level Security
  // by design (the app's own Basic Auth + per-client ownership checks are
  // the access control here, not Supabase RLS), so this module must never
  // be imported from client components.
  real = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return real;
}

export const supabaseStorage: StorageProvider = {
  async upload(localPath, destPath, bucket) {
    const client = getClient();
    const data = await fs.promises.readFile(localPath);
    const { error } = await client.storage.from(bucket).upload(destPath, data, { upsert: true });
    if (error) {
      throw new Error(`Supabase Storage upload failed (bucket=${bucket}, path=${destPath}): ${error.message}`);
    }
    return { key: destPath };
  },

  async download(key, bucket, localPath) {
    const client = getClient();
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data) {
      throw new Error(`Supabase Storage download failed (bucket=${bucket}, key=${key}): ${error?.message ?? "no data"}`);
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    await fs.promises.writeFile(localPath, buffer);
  },

  async getSignedUrl(key, bucket, expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS) {
    const client = getClient();
    const { data, error } = await client.storage.from(bucket).createSignedUrl(key, expiresInSeconds);
    if (error || !data) {
      throw new Error(`Supabase Storage signed URL failed (bucket=${bucket}, key=${key}): ${error?.message ?? "no data"}`);
    }
    return data.signedUrl;
  },

  async createUploadUrl(destPath, bucket) {
    const client = getClient();
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(destPath);
    if (error || !data) {
      throw new Error(`Supabase Storage signed upload URL failed (bucket=${bucket}, path=${destPath}): ${error?.message ?? "no data"}`);
    }
    return { key: data.path, uploadUrl: data.signedUrl, token: data.token };
  },
};
