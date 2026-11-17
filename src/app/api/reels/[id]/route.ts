import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reelItems } from "@/db/schema";
import { jsonError, zodError } from "@/lib/api-utils";
import { triggerReelWorker } from "@/lib/reels/triggerWorker";
import { recordTriggerFailure } from "@/lib/reels/jobQueue";
import { storage } from "@/lib/storage";

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "reprocess"]),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(reelItems).where(eq(reelItems.id, id));
  if (!row) return jsonError("Reel item not found", 404);

  // outputStorageKey is the durable reference; any stored renderedVideoUrl
  // may be an expired signed URL, so a fresh one is generated per request
  // rather than trusted from the DB. A failure here (e.g. storage not
  // configured) surfaces as a null URL, not a broken page.
  let signedOutputUrl: string | null = null;
  if (row.outputStorageKey) {
    signedOutputUrl = await storage.getSignedUrl(row.outputStorageKey, "reel-output").catch(() => null);
  }
  return NextResponse.json({ ...row, signedOutputUrl });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [existing] = await db.select().from(reelItems).where(eq(reelItems.id, id));
  if (!existing) return jsonError("Reel item not found", 404);

  if (parsed.data.action === "approve") {
    if (existing.status !== "ready_for_review") {
      return jsonError(`Can only approve a reel that's ready for review (current status: ${existing.status})`, 409);
    }
    const [row] = await db
      .update(reelItems)
      .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(reelItems.id, id))
      .returning();
    return NextResponse.json(row);
  }

  if (parsed.data.action === "reject") {
    const [row] = await db
      .update(reelItems)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(reelItems.id, id))
      .returning();
    return NextResponse.json(row);
  }

  // reprocess — only makes sense from a failed state; re-runs the same pipeline.
  if (existing.status !== "failed") {
    return jsonError(`Can only reprocess a failed reel (current status: ${existing.status})`, 409);
  }
  const [row] = await db
    .update(reelItems)
    .set({
      status: "uploaded",
      errorMessage: "",
      progressStage: "",
      claimedAt: null,
      claimedBy: "",
      updatedAt: new Date(),
    })
    .where(eq(reelItems.id, id))
    .returning();

  after(() => {
    triggerReelWorker().catch((err) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to trigger reel worker for reprocessing ${id}:`, err);
      recordTriggerFailure(
        id,
        `Still queued — the last attempt to start processing failed (${message}). It will retry automatically.`,
      ).catch(() => {});
    });
  });

  return NextResponse.json(row);
}
