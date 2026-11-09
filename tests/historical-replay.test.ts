import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contentItems, weeklyBriefs } from "@/db/schema";
import { createTestClient } from "./helpers";
import { approveContentItem } from "@/lib/approval";
import { processDueReminders } from "@/lib/reminders/processDueReminders";

describe("historical replay never triggers a live reminder", () => {
  it("excludes an approved, due, historical-replay item from the reminder cron", async () => {
    const client = await createTestClient();
    const [brief] = await db
      .insert(weeklyBriefs)
      .values({
        clientId: client.id,
        weekStart: "2025-06-01", // a past week being tested
        rawIdeas: "reconstructed brief",
        isHistoricalReplay: true,
      })
      .returning();

    const [item] = await db
      .insert(contentItems)
      .values({
        clientId: client.id,
        briefId: brief!.id,
        scheduledAt: new Date(Date.now() - 60_000), // due
        contentConcept: "retrospective concept",
        draftCaption: "retrospective caption",
        currentCaption: "retrospective caption",
        isHistoricalReplay: true,
      })
      .returning();

    // Even if someone approves a replay item (e.g. by mistake, or because the
    // UI doesn't prevent it), the reminder system must still never fire for it.
    await approveContentItem(item!.id);

    const result = await processDueReminders();
    expect(result.sent).toBe(0);
    expect(result.due).toBe(0); // the query itself excludes replay rows
  });
});
