import { NextResponse, type NextRequest } from "next/server";
import { triggerReelWorker } from "@/lib/reels/triggerWorker";

/**
 * Safety net only — reels are normally triggered immediately on
 * submission (see POST /api/reels). This exists for the two cases that
 * misses: the trigger-on-submission call itself failing transiently, or
 * a worker crashing without reporting failure (claimNextReelJob's
 * stale-claim recovery only kicks in once *something* tries to claim
 * again). Runs once daily — Vercel Hobby doesn't allow a cron entry more
 * often than that (hit this exact limit earlier in this project), which
 * is fine for a safety net that isn't the primary trigger path.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set — refusing to run so this endpoint can't be triggered by anyone who finds the URL." },
      { status: 503 },
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await triggerReelWorker();
    return NextResponse.json({ triggered: true });
  } catch (err) {
    console.error("process-reels safety-net cron failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger reel worker" },
      { status: 500 },
    );
  }
}
