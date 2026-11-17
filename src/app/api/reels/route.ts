import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reelItems } from "@/db/schema";
import { jsonError, zodError } from "@/lib/api-utils";
import { triggerReelWorker } from "@/lib/reels/triggerWorker";
import { recordTriggerFailure } from "@/lib/reels/jobQueue";
import { storage } from "@/lib/storage";

// Exactly one of rawFootageUrl (external import) or rawFootageStorageKey
// (direct browser upload to the reel-raw bucket, via POST /api/reels/upload-url)
// must be provided.
const createReelSchema = z
  .object({
    clientId: z.string().uuid(),
    rawFootageUrl: z.string().url().optional(),
    rawFootageStorageKey: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.rawFootageUrl) !== Boolean(v.rawFootageStorageKey), {
    message: "Provide exactly one of rawFootageUrl or rawFootageStorageKey, not both or neither.",
  });

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const rows = clientId
    ? await db.select().from(reelItems).where(eq(reelItems.clientId, clientId)).orderBy(desc(reelItems.createdAt))
    : await db.select().from(reelItems).orderBy(desc(reelItems.createdAt));

  // Same reasoning as GET /api/reels/[id]: outputStorageKey is the durable
  // reference, any stored renderedVideoUrl may be an expired signed URL,
  // so a fresh one is generated per request. This list endpoint is what
  // ReelsPanel.tsx actually polls (not the single-item route) — without
  // this, the video preview silently never appeared for a completed reel,
  // confirmed by actually loading the live page, not just reading the code.
  const withSignedUrls = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      // Only the two statuses ReelsPanel.tsx actually renders a <video> for
      // — no point signing a URL for a rejected/failed/in-progress row on
      // every poll.
      signedOutputUrl:
        row.outputStorageKey && (row.status === "ready_for_review" || row.status === "approved")
          ? await storage.getSignedUrl(row.outputStorageKey, "reel-output").catch(() => null)
          : null,
    })),
  );

  return NextResponse.json(withSignedUrls);
}

/**
 * Creates the reel_item immediately (status "uploaded") and returns
 * without waiting for the pipeline. Processing itself runs in a Vercel
 * Sandbox (see triggerWorker.ts / worker/run.ts), not inside this
 * request — a plain serverless function can't compile whisper.cpp or
 * run a real headless-Chrome render. `after()` only has to fire off the
 * sandbox creation call (fast), not wait for the job to finish.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = createReelSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db
    .insert(reelItems)
    .values({
      clientId: parsed.data.clientId,
      rawFootageUrl: parsed.data.rawFootageUrl ?? "",
      rawFootageStorageKey: parsed.data.rawFootageStorageKey ?? null,
    })
    .returning();

  if (!row) return jsonError("Failed to create reel item", 500);

  after(() => {
    triggerReelWorker().catch((err) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to trigger reel worker for ${row.id}:`, err);
      recordTriggerFailure(
        row.id,
        `Still queued — the last attempt to start processing failed (${message}). It will retry automatically.`,
      ).catch(() => {});
    });
  });

  return NextResponse.json(row, { status: 201 });
}
