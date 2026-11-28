import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { GenerationError } from "./generateWeeklyCalendar";
import { submitWeeklyBrief } from "./submitWeeklyBrief";

export interface AutoBriefResult {
  clientId: string;
  clientName: string;
  weekStart: string;
  status: "generated" | "skipped" | "failed";
  detail: string;
}

/** The Sunday strictly after `today` (never today itself, even if today is a Sunday). */
export function nextWeekStart(today: Date = new Date()): string {
  const day = today.getUTCDay();
  const daysAhead = (7 - day) % 7 || 7;
  const next = new Date(today);
  next.setUTCDate(today.getUTCDate() + daysAhead);
  return next.toISOString().slice(0, 10);
}

/**
 * Runs on a schedule (see /api/cron/weekly-brief) so nobody has to remember
 * to open the site and submit a brief every week. Generates next week's
 * content plan for every active client straight from their saved profile —
 * same as submitting the form with every field left blank. submitWeeklyBrief
 * already treats a repeat submission for the same week as a no-op (or a
 * careful regeneration that never touches approved items), so a client who
 * already has a hand-submitted brief for that week is left alone.
 */
export async function generateDueWeeklyBriefs(): Promise<AutoBriefResult[]> {
  const weekStart = nextWeekStart();
  const activeClients = await db.select().from(clients).where(eq(clients.active, true));

  // Concurrently: each calendar can take over a minute, and running clients
  // one after another would hit the route's maxDuration as clients are added.
  return Promise.all(
    activeClients.map(async (client): Promise<AutoBriefResult> => {
      try {
        const result = await submitWeeklyBrief({
          clientId: client.id,
          weekStart,
          rawIdeas: "",
          promotions: "",
          events: "",
          additionalInstructions: "",
        });
        return {
          clientId: client.id,
          clientName: client.name,
          weekStart,
          status: result.generatedCount > 0 ? "generated" : "skipped",
          detail: result.message,
        };
      } catch (err) {
        console.error(`Weekly plan generation failed for client "${client.name}" (week ${weekStart}):`, err);
        const detail = err instanceof GenerationError ? err.message : "Unexpected error while generating.";
        return { clientId: client.id, clientName: client.name, weekStart, status: "failed", detail };
      }
    }),
  );
}
