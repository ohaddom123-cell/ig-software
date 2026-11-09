import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentItems, reminderDeliveries, weeklyBriefs } from "@/db/schema";
import { createTestClient } from "./helpers";
import { approveContentItem, rejectContentItem } from "@/lib/approval";
import { processDueReminders } from "@/lib/reminders/processDueReminders";

async function makeItem(clientId: string, overrides: Partial<typeof contentItems.$inferInsert> = {}) {
  const [brief] = await db
    .insert(weeklyBriefs)
    .values({ clientId, weekStart: "2026-01-04", rawIdeas: "test" })
    .returning();
  const [item] = await db
    .insert(contentItems)
    .values({
      clientId,
      briefId: brief!.id,
      scheduledAt: new Date(Date.now() - 60_000), // one minute ago — due
      contentConcept: "concept",
      draftCaption: "caption",
      currentCaption: "caption",
      ...overrides,
    })
    .returning();
  return item!;
}

describe("approval gate: only approved+due content can trigger a reminder", () => {
  it("never sends a reminder for a draft item, even if its scheduled time has passed", async () => {
    const client = await createTestClient();
    await makeItem(client.id); // left as draft

    const result = await processDueReminders();

    expect(result.sent).toBe(0);
    const deliveries = await db.select().from(reminderDeliveries);
    expect(deliveries).toHaveLength(0);
  });

  it("never sends a reminder for a rejected item", async () => {
    const client = await createTestClient();
    const item = await makeItem(client.id);
    await rejectContentItem(item.id);

    const result = await processDueReminders();

    expect(result.sent).toBe(0);
    const deliveries = await db.select().from(reminderDeliveries);
    expect(deliveries).toHaveLength(0);
  });

  it("sends exactly one reminder for an approved, due item", async () => {
    const client = await createTestClient();
    const item = await makeItem(client.id);
    await approveContentItem(item.id);

    const result = await processDueReminders();

    expect(result.sent).toBe(1);
    const deliveries = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.contentItemId, item.id));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.deliveryStatus).toBe("sent");
  });

  it("does not send a reminder for an approved item whose time hasn't arrived yet", async () => {
    const client = await createTestClient();
    const item = await makeItem(client.id, {
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000), // one hour from now
    });
    await approveContentItem(item.id);

    const result = await processDueReminders();

    expect(result.sent).toBe(0);
  });
});
