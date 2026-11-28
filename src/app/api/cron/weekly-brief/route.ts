import { NextResponse, type NextRequest } from "next/server";
import { generateDueWeeklyBriefs } from "@/lib/generation/generateDueWeeklyBriefs";

// Generates one calendar per client sequentially, each of which can take
// well over a minute with adaptive thinking.
export const maxDuration = 300;

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
    const results = await generateDueWeeklyBriefs();
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Weekly brief cron failed:", err);
    return NextResponse.json({ error: "Weekly brief generation failed" }, { status: 500 });
  }
}
