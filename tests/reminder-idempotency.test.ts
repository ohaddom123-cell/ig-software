import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentItems, reminderDeliveries, weeklyBriefs } from "@/db/schema";
import { createTestClient } from "./helpers";
import { approveContentItem, editContentItemCaption } from "@/lib/approval";
import { processDueReminders } from "@/lib/reminders/processDueReminders";

async function makeApprovedDueItem(clientId: string) {
  const [brief] = await db
    .insert(weeklyBriefs)
    .values({ clientId, weekStart: "2026-01-04", rawIdeas: "test" })
    .returning();
  const [item] = await db
    .insert(contentItems)
    .values({
      clientId,
      briefId: brief!.id,
      scheduledAt: new Date(Date.now() - 60_000),
      contentConcept: "concept",
      draftCaption: "caption",
      currentCaption: "caption",
    })
    .returning();
  await approveContentItem(item!.id);
  return item!;
}

describe("reminder idempotency", () => {
  it("a sent reminder is never sent twice, even if the cron runs again", async () => {
    const client = await createTestClient();
    const item = await makeApprovedDueItem(client.id);

    const first = await processDueReminders();
    const second = await processDueReminders();

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(second.skippedAlreadySent).toBe(1);

    const deliveries = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.contentItemId, item.id));
    expect(deliveries).toHaveLength(1);
  });

  it("editing an approved item after its reminder was sent produces a NEW reminder for the new version, not a silent resend of stale content", async () => {
    const client = await createTestClient();
    const item = await makeApprovedDueItem(client.id);
    await processDueReminders(); // first reminder, for approvedVersion 1

    // Edit reverts to draft; re-approve bumps approvedVersion.
    await editContentItemCaption(item.id, "updated caption");
    await approveContentItem(item.id);

    const result = await processDueReminders();
    expect(result.sent).toBe(1); // a second, distinct delivery — not skipped as a duplicate

    const deliveries = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.contentItemId, item.id));
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((d) => d.approvedVersion).sort()).toEqual([1, 2]);
  });

  it("a concurrent duplicate insert for the same (item, approvedVersion) is rejected by the DB constraint, not just application logic", async () => {
    const client = await createTestClient();
    const item = await makeApprovedDueItem(client.id);

    await db.insert(reminderDeliveries).values({
      contentItemId: item.id,
      approvedVersion: item.version,
      scheduledFor: item.scheduledAt,
      provider: "dryrun",
      deliveryStatus: "sent",
    });

    await expect(
      db.insert(reminderDeliveries).values({
        contentItemId: item.id,
        approvedVersion: item.version,
        scheduledFor: item.scheduledAt,
        provider: "dryrun",
        deliveryStatus: "sent",
      }),
    ).rejects.toThrow();
  });
});
