import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { reelItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { createTestClient } from "./helpers";
import {
  claimNextReelJob,
  markFailed,
  recordTriggerFailure,
  reportProgress,
  MAX_RETRIES,
  STALE_CLAIM_MINUTES,
} from "@/lib/reels/jobQueue";

async function createReel(clientId: string, overrides: Partial<typeof reelItems.$inferInsert> = {}) {
  const [row] = await db
    .insert(reelItems)
    .values({ clientId, rawFootageUrl: "https://example.com/raw.mp4", ...overrides })
    .returning();
  if (!row) throw new Error("Failed to create test reel");
  return row;
}

describe("claimNextReelJob", () => {
  it("claims an uploaded job and marks it downloading with the claiming worker's id", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);

    const claimed = await claimNextReelJob("worker-a");

    expect(claimed?.id).toBe(reel.id);
    expect(claimed?.status).toBe("downloading");
    expect(claimed?.claimedBy).toBe("worker-a");
    expect(claimed?.claimedAt).not.toBeNull();
  });

  it("returns null when there is nothing to claim", async () => {
    await createTestClient(); // no reel created for this client
    const claimed = await claimNextReelJob("worker-a");
    expect(claimed).toBeNull();
  });

  it("never lets two concurrent claims return the same job — concurrency safety", async () => {
    const client = await createTestClient();
    const reelA = await createReel(client.id);
    const reelB = await createReel(client.id);

    const [first, second] = await Promise.all([
      claimNextReelJob("worker-a"),
      claimNextReelJob("worker-b"),
    ]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.id).not.toBe(second!.id);
    const claimedIds = [first!.id, second!.id].sort();
    const expectedIds = [reelA.id, reelB.id].sort();
    expect(claimedIds).toEqual(expectedIds);
  });

  it("does not reclaim a job that was claimed recently and is still in progress", async () => {
    const client = await createTestClient();
    await createReel(client.id);

    const first = await claimNextReelJob("worker-a");
    expect(first).not.toBeNull();

    const second = await claimNextReelJob("worker-b");
    expect(second).toBeNull(); // still fresh, not stale — must not be picked up again
  });

  it("recovers a job abandoned by a crashed worker once its claim goes stale", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);

    const first = await claimNextReelJob("worker-a");
    expect(first?.id).toBe(reel.id);

    // Simulate the claim having gone stale (worker crashed mid-job).
    await db.execute(sql`
      UPDATE reel_items
      SET claimed_at = now() - make_interval(mins => ${STALE_CLAIM_MINUTES + 1})
      WHERE id = ${reel.id}
    `);

    const second = await claimNextReelJob("worker-b");
    expect(second?.id).toBe(reel.id);
    expect(second?.claimedBy).toBe("worker-b");
    expect(second?.retryCount).toBe(1); // incremented, not reset
  });

  it("stops reclaiming a job once it has exhausted its retries", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id, { retryCount: MAX_RETRIES - 1, status: "downloading", claimedAt: new Date(0), claimedBy: "worker-a" });

    const claimed = await claimNextReelJob("worker-b");
    // retryCount (MAX_RETRIES - 1) is still < MAX_RETRIES, so this one
    // last attempt should succeed...
    expect(claimed?.id).toBe(reel.id);
    expect(claimed?.retryCount).toBe(MAX_RETRIES);

    // ...but once it's at MAX_RETRIES and goes stale again, it must not
    // be claimed a further time.
    await db.execute(sql`
      UPDATE reel_items SET claimed_at = now() - make_interval(mins => ${STALE_CLAIM_MINUTES + 1}) WHERE id = ${reel.id}
    `);
    const notClaimed = await claimNextReelJob("worker-c");
    expect(notClaimed).toBeNull();
  });
});

describe("reportProgress / markFailed", () => {
  it("updates status and progress stage", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);
    await claimNextReelJob("worker-a");

    await reportProgress(reel.id, "transcribing", "transcribing audio");

    const [row] = await db.select().from(reelItems).where(eq(reelItems.id, reel.id));
    expect(row?.status).toBe("transcribing");
    expect(row?.progressStage).toBe("transcribing audio");
  });

  it("marks a job failed with the error message, and it is not reclaimed afterward", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);
    await claimNextReelJob("worker-a");

    await markFailed(reel.id, "simulated failure");

    const [row] = await db.select().from(reelItems).where(eq(reelItems.id, reel.id));
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("simulated failure");

    const reclaimed = await claimNextReelJob("worker-b");
    expect(reclaimed).toBeNull();
  });
});

describe("recordTriggerFailure", () => {
  it("records the message but leaves the job queued (not failed) for the cron to retry", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);

    await recordTriggerFailure(reel.id, "sandbox create failed");

    const [row] = await db.select().from(reelItems).where(eq(reelItems.id, reel.id));
    expect(row?.status).toBe("uploaded");
    expect(row?.errorMessage).toBe("sandbox create failed");

    // still claimable — a trigger failure must not make the job unretryable
    const claimed = await claimNextReelJob("worker-a");
    expect(claimed?.id).toBe(reel.id);
  });

  it("does not clobber a status/message that already moved past 'uploaded'", async () => {
    const client = await createTestClient();
    const reel = await createReel(client.id);
    await markFailed(reel.id, "a real processing failure");

    await recordTriggerFailure(reel.id, "stale trigger-failure callback, fired late");

    const [row] = await db.select().from(reelItems).where(eq(reelItems.id, reel.id));
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("a real processing failure");
  });
});
