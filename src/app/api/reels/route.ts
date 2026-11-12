import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { reelItems } from "@/db/schema";
import { jsonError, zodError } from "@/lib/api-utils";
import { processReelItem } from "@/lib/reels/processReel";

const createReelSchema = z.object({
  clientId: z.string().uuid(),
  rawFootageUrl: z.string().url(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const rows = clientId
    ? await db.select().from(reelItems).where(eq(reelItems.clientId, clientId)).orderBy(desc(reelItems.createdAt))
    : await db.select().from(reelItems).orderBy(desc(reelItems.createdAt));

  return NextResponse.json(rows);
}

/**
 * Creates the reel_item immediately (status "uploaded") and returns
 * without waiting for the pipeline — rendering can take a while, longer
 * than a request should stay open. Processing is kicked off via
 * `after()` so it keeps running once the response is sent, same
 * serverless invocation, no separate queue/worker needed at this volume.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = createReelSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db
    .insert(reelItems)
    .values({ clientId: parsed.data.clientId, rawFootageUrl: parsed.data.rawFootageUrl })
    .returning();

  if (!row) return jsonError("Failed to create reel item", 500);

  after(() => {
    processReelItem(row.id).catch((err) => {
      console.error(`Reel processing failed for ${row.id}:`, err);
    });
  });

  return NextResponse.json(row, { status: 201 });
}
