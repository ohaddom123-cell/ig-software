/**
 * Worker entry point. Runs inside a Vercel Sandbox restored from a
 * pre-built snapshot (whisper.cpp already compiled, model already
 * downloaded — see worker/README.md for how that snapshot is built).
 * Not part of the Next.js app's build; invoked directly via
 * `npx tsx worker/run.ts` inside the sandbox.
 *
 * Claims and processes every currently-queued reel job in a loop (not
 * just one), so a single sandbox spin-up per cron tick drains the whole
 * backlog instead of needing one sandbox per job. Exits 0 whether it
 * processed zero or many jobs — "nothing to do" is success, not failure.
 */
import { claimNextReelJob } from "../src/lib/reels/jobQueue";
import { processReelItem } from "../src/lib/reels/processReel";

const WORKER_ID = `sandbox-${process.env.VERCEL_SANDBOX_NAME ?? process.env.HOSTNAME ?? "unknown"}-${process.pid}`;

async function main() {
  console.log(`[worker ${WORKER_ID}] starting`);
  let processed = 0;
  let failed = 0;

  for (;;) {
    const job = await claimNextReelJob(WORKER_ID);
    if (!job) {
      console.log(`[worker ${WORKER_ID}] no more queued jobs`);
      break;
    }
    console.log(`[worker ${WORKER_ID}] claimed reel ${job.id} (attempt ${job.retryCount + 1})`);
    try {
      await processReelItem(job.id);
      processed++;
      console.log(`[worker ${WORKER_ID}] reel ${job.id} completed`);
    } catch (err) {
      failed++;
      console.error(`[worker ${WORKER_ID}] reel ${job.id} failed:`, err);
      // processReelItem already persisted the failure to the DB via
      // markFailed — this catch exists only so one bad job doesn't stop
      // the loop from draining the rest of the backlog.
    }
  }

  console.log(`[worker ${WORKER_ID}] done — processed=${processed} failed=${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[worker ${WORKER_ID}] fatal error outside the job loop:`, err);
    process.exit(1);
  });
