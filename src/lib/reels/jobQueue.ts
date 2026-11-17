import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { reelItems } from "@/db/schema";

export const STALE_CLAIM_MINUTES = 15;
export const MAX_RETRIES = 3;

export type ReelJobRow = typeof reelItems.$inferSelect;

/**
 * Atomically claims exactly one queued-or-abandoned reel job using
 * Postgres `FOR UPDATE SKIP LOCKED` inside the UPDATE's subquery — the
 * standard concurrency-safe job-queue idiom, so two workers polling at
 * the same time can never both claim the same row. No separate queue
 * service; this database is already the single source of truth.
 *
 * "Abandoned" means claimed more than STALE_CLAIM_MINUTES ago and never
 * reached a terminal state — recovers jobs whose worker crashed
 * mid-processing without needing a heartbeat mechanism. retry_count
 * caps how many times that can happen before a job is left alone (the
 * caller is responsible for eventually marking a too-many-retries job
 * "failed" — see markFailed below).
 *
 * db.execute(sql\`...\`) on this project's installed drizzle-orm +
 * postgres-js versions returns the result rows directly as an
 * array-like object (confirmed by testing against the real local DB,
 * not assumed) — no `.rows` wrapper. It also, unlike the typed query
 * builder, returns raw Postgres column names (snake_case) rather than
 * the schema's camelCase — confirmed the hard way, by a failing test —
 * so every column is explicitly aliased below to match ReelJobRow.
 */
const RETURNING_CAMEL_CASE = `
  id, client_id AS "clientId", raw_footage_url AS "rawFootageUrl",
  raw_footage_storage_key AS "rawFootageStorageKey", status,
  error_message AS "errorMessage", claimed_at AS "claimedAt",
  claimed_by AS "claimedBy", retry_count AS "retryCount",
  progress_stage AS "progressStage", keep_segments AS "keepSegments",
  captions, rendered_video_url AS "renderedVideoUrl",
  output_storage_key AS "outputStorageKey", approved_at AS "approvedAt",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

export async function claimNextReelJob(workerId: string): Promise<ReelJobRow | null> {
  const result = await db.execute(sql`
    UPDATE reel_items
    SET status = 'downloading',
        claimed_at = now(),
        claimed_by = ${workerId},
        retry_count = CASE WHEN status = 'uploaded' THEN retry_count ELSE retry_count + 1 END,
        progress_stage = 'downloading',
        updated_at = now()
    WHERE id = (
      SELECT id FROM reel_items
      WHERE status = 'uploaded'
         OR (
           status IN ('downloading', 'transcribing', 'editing', 'rendering', 'uploading')
           AND claimed_at < now() - make_interval(mins => ${STALE_CLAIM_MINUTES})
           AND retry_count < ${MAX_RETRIES}
         )
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING ${sql.raw(RETURNING_CAMEL_CASE)}
  `);
  const row = (result as unknown as Record<number, unknown>)[0];
  return (row as ReelJobRow | undefined) ?? null;
}

/** Updates the coarse status + human-readable stage for a job this worker holds. */
export async function reportProgress(
  reelId: string,
  status: ReelJobRow["status"],
  progressStage: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE reel_items
    SET status = ${status}, progress_stage = ${progressStage}, updated_at = now()
    WHERE id = ${reelId}
  `);
}

/** Marks a job permanently failed (no more automatic retries). */
export async function markFailed(reelId: string, errorMessage: string): Promise<void> {
  await db.execute(sql`
    UPDATE reel_items
    SET status = 'failed', error_message = ${errorMessage}, progress_stage = '', updated_at = now()
    WHERE id = ${reelId}
  `);
}
