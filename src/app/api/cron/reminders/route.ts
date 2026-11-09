import { NextResponse, type NextRequest } from "next/server";
import { processDueReminders } from "@/lib/reminders/processDueReminders";

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
    const result = await processDueReminders();
    return NextResponse.json({
      remindersLive: process.env.REMINDERS_LIVE === "true",
      ...result,
    });
  } catch (err) {
    console.error("Reminder cron failed:", err);
    return NextResponse.json({ error: "Reminder processing failed" }, { status: 500 });
  }
}
