export type StorageBucket = "reel-raw" | "reel-output";

/**
 * Narrow interface so the actual provider (Supabase Storage today) can be
 * swapped later without touching call sites. Every method takes a bucket
 * explicitly rather than baking "which bucket" into the implementation,
 * since raw footage and rendered output have different access patterns
 * (raw footage is written once by the browser and read once by the
 * worker; output is written once by the worker and read repeatedly,
 * possibly long after the signed URL from the write has expired).
 */
export interface StorageProvider {
  /** Uploads a local file; returns the bucket-relative key to store in the DB. */
  upload(localPath: string, destPath: string, bucket: StorageBucket): Promise<{ key: string }>;

  /** Downloads a previously uploaded object to a local path. */
  download(key: string, bucket: StorageBucket, localPath: string): Promise<void>;

  /** A time-limited URL for reading an object. Buckets are private, so
   * this is the only supported way to actually view/download a file —
   * never assume a stored URL is still valid. */
  getSignedUrl(key: string, bucket: StorageBucket, expiresInSeconds?: number): Promise<string>;

  /** A time-limited URL + fields for the browser to upload directly to,
   * bypassing Next.js API routes entirely for large files. */
  createUploadUrl(
    destPath: string,
    bucket: StorageBucket,
  ): Promise<{ key: string; uploadUrl: string; token: string }>;
}
