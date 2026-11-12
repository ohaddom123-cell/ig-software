import fs from "node:fs";
import { put } from "@vercel/blob";

/**
 * Uploads a local file and returns its public URL. Lazy-checked the same
 * way as db/client.ts and lib/anthropic.ts: throws only when actually
 * called without BLOB_READ_WRITE_TOKEN configured, not at import time.
 *
 * Provisioning a Blob store for this project failed in this session with
 * a 403 (account/plan permissions, not something retrying fixes) — see
 * README. Until that's resolved (or another public storage provider is
 * wired in here instead), rendered reels can't actually be uploaded
 * anywhere, which is the one missing link between "render succeeded" and
 * "there's a URL to approve/schedule."
 */
export async function uploadPublicFile(localPath: string, destPath: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set — file storage is implemented but not configured. Create a Vercel Blob store for this project (Storage tab in the Vercel dashboard) and it will set this automatically.",
    );
  }
  const data = await fs.promises.readFile(localPath);
  const blob = await put(destPath, data, { access: "public", addRandomSuffix: true });
  return blob.url;
}
