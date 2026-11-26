import { Sandbox } from "@vercel/sandbox";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — generous for whisper+render on a real clip

/**
 * Starts a Sandbox worker run and returns immediately without waiting for
 * it to finish (`detached: true`) — the actual processing (compiling
 * nothing, since the snapshot already has whisper.cpp built; downloading,
 * transcribing, rendering) can take minutes, far longer than a Next.js
 * function should stay alive for. The worker updates job status directly
 * in Postgres as it goes (see worker/run.ts + jobQueue.ts); this function
 * only needs to confirm the sandbox and command actually started.
 *
 * Called from `after()` on reel submission/reprocess, and from the daily
 * safety-net cron (which exists only to catch jobs whose trigger-on-
 * submission call itself failed, or whose worker crashed without
 * reporting — see claimNextReelJob's stale-claim recovery).
 */
export async function triggerReelWorker(): Promise<void> {
  const snapshotId = process.env.REEL_WORKER_SNAPSHOT_ID;
  if (!snapshotId) {
    throw new Error(
      "REEL_WORKER_SNAPSHOT_ID is not set — the pre-built Sandbox snapshot (whisper.cpp + model) " +
        "hasn't been created yet, or its ID wasn't configured. The reel was saved but won't be processed until this is set.",
    );
  }

  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: SANDBOX_TIMEOUT_MS,
    // `persistent` defaults to true, which auto-snapshots the sandbox's
    // filesystem on every shutdown — meaning every single job run was
    // silently leaving behind a ~2GB throwaway snapshot forever. Those
    // accumulated until the account's Snapshot Storage quota was exceeded,
    // which caused Vercel to evict the *real* worker snapshot
    // (REEL_WORKER_SNAPSHOT_ID itself) to reclaim space — breaking every
    // job with a 402 quota error that looked unrelated to this. A worker
    // run never needs its own state preserved after it exits (job results
    // live in Postgres/Supabase Storage, not the sandbox filesystem), so
    // there's nothing to snapshot here.
    persistent: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      // Without this, the worker always falls back to its own "small"
      // default regardless of what's configured on the Vercel project —
      // the whole point of WHISPER_MODEL being centralised/configurable
      // (see transcribe.ts) is that this forwarding has to actually happen.
      // Omitted entirely when unset, not forwarded as "" — confirmed the
      // hard way: processReel.ts's `process.env.WHISPER_MODEL ?? "small"`
      // only treats null/undefined as missing, not an empty string, so a
      // forwarded "" silently skipped the "small" default and broke every
      // job with "Invalid whisper model ." (also hardened on the
      // processReel.ts side, but this avoids manufacturing the empty
      // value in the first place).
      ...(process.env.WHISPER_MODEL ? { WHISPER_MODEL: process.env.WHISPER_MODEL } : {}),
    },
  });

  await sandbox.runCommand({
    cmd: "npx",
    args: ["tsx", "worker/run.ts"],
    detached: true,
  });
}
