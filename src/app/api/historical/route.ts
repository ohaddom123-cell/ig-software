import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, contentItems, weeklyBriefs } from "@/db/schema";
import { jsonError, zodError } from "@/lib/api-utils";
import { GenerationError } from "@/lib/generation/generateWeeklyCalendar";
import { submitWeeklyBrief } from "@/lib/generation/submitWeeklyBrief";

const historicalInputSchema = z.object({
  clientId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
  rawIdeas: z.string().default(""),
  promotions: z.string().default(""),
  events: z.string().default(""),
  additionalInstructions: z.string().default(""),
});

/**
 * Same generation pipeline as /api/briefs, forced into replay mode.
 * isHistoricalReplay=true on both the brief and every resulting content
 * item is what keeps this out of the reminder cron's query entirely
 * (see processDueReminders.ts) — retrospective runs can never fire a real
 * reminder, by construction, not by remembering to check a flag in the UI.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = historicalInputSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const result = await submitWeeklyBrief({ ...parsed.data, isHistoricalReplay: true });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof GenerationError) return jsonError(err.message, 422);
    console.error("Unexpected error in historical replay:", err);
    return jsonError("Unexpected server error", 500);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");
  const weekStart = searchParams.get("weekStart");
  if (!clientId || !weekStart) return jsonError("clientId and weekStart are required");

  const [brief] = await db
    .select()
    .from(weeklyBriefs)
    .where(
      and(
        eq(weeklyBriefs.clientId, clientId),
        eq(weeklyBriefs.weekStart, weekStart),
        eq(weeklyBriefs.isHistoricalReplay, true),
      ),
    );

  if (!brief) return NextResponse.json({ brief: null, items: [] });

  const items = await db.select().from(contentItems).where(eq(contentItems.briefId, brief.id));
  return NextResponse.json({ brief, items });
}
