import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, zodError } from "@/lib/api-utils";
import { GenerationError } from "@/lib/generation/generateWeeklyCalendar";
import { submitWeeklyBrief } from "@/lib/generation/submitWeeklyBrief";

const briefInputSchema = z.object({
  clientId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
  rawIdeas: z.string().default(""),
  promotions: z.string().default(""),
  events: z.string().default(""),
  additionalInstructions: z.string().default(""),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = briefInputSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  try {
    const result = await submitWeeklyBrief(parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof GenerationError) {
      return jsonError(err.message, 422);
    }
    console.error("Unexpected error submitting weekly brief:", err);
    return jsonError("Unexpected server error while generating the calendar.", 500);
  }
}
