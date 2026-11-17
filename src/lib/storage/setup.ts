import { createClient } from "@supabase/supabase-js";

const BUCKETS: { name: string; fileSizeLimitMb: number }[] = [
  { name: "reel-raw", fileSizeLimitMb: 500 },
  { name: "reel-output", fileSizeLimitMb: 500 },
];

/**
 * One-time (idempotent) setup: creates the two private Storage buckets
 * this app needs if they don't already exist. Run manually:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run storage:setup
 *
 * Not run automatically on every build/deploy (unlike db:migrate) because
 * bucket creation isn't idempotent-by-default the same way SQL migrations
 * are, and there's no reason to call the Storage API on every deploy for
 * something that, once created, never needs to change.
 */
async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.");
  }

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { data: existing, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`Failed to list buckets: ${listError.message}`);
  const existingNames = new Set((existing ?? []).map((b) => b.name));

  for (const bucket of BUCKETS) {
    if (existingNames.has(bucket.name)) {
      console.log(`Bucket "${bucket.name}" already exists — skipping.`);
      continue;
    }
    const { error } = await client.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: `${bucket.fileSizeLimitMb}MB`,
    });
    if (error) throw new Error(`Failed to create bucket "${bucket.name}": ${error.message}`);
    console.log(`Created private bucket "${bucket.name}".`);
  }

  console.log("Storage setup complete.");
}

main().catch((err) => {
  console.error("Storage setup failed:", err);
  process.exit(1);
});
