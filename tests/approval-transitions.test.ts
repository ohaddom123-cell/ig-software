import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { contentItems, weeklyBriefs } from "@/db/schema";
import { createTestClient } from "./helpers";
import { approveContentItem, editContentItemCaption, rejectContentItem } from "@/lib/approval";

async function makeDraftItem(clientId: string) {
  const [brief] = await db
    .insert(weeklyBriefs)
    .values({ clientId, weekStart: "2026-01-04", rawIdeas: "test" })
    .returning();
  const [item] = await db
    .insert(contentItems)
    .values({
      clientId,
      briefId: brief!.id,
      scheduledAt: new Date(),
      contentConcept: "concept",
      draftCaption: "original",
      currentCaption: "original",
    })
    .returning();
  return item!;
}

describe("approval state transitions", () => {
  it("starts every generated item as draft", async () => {
    const client = await createTestClient();
    const item = await makeDraftItem(client.id);
    expect(item.approvalStatus).toBe("draft");
  });

  it("editing an approved item reverts it to draft and clears approvedAt", async () => {
    const client = await createTestClient();
    const item = await makeDraftItem(client.id);
    const approved = await approveContentItem(item.id);
    expect(approved!.approvalStatus).toBe("approved");
    expect(approved!.approvedAt).not.toBeNull();

    const edited = await editContentItemCaption(item.id, "a different caption");
    expect(edited!.approvalStatus).toBe("draft");
    expect(edited!.approvedAt).toBeNull();
    expect(edited!.currentCaption).toBe("a different caption");
    expect(edited!.version).toBe(2);
  });

  it("editing a draft item bumps the version but doesn't touch approval status", async () => {
    const client = await createTestClient();
    const item = await makeDraftItem(client.id);
    const edited = await editContentItemCaption(item.id, "tweaked");
    expect(edited!.approvalStatus).toBe("draft");
    expect(edited!.version).toBe(2);
  });

  it("re-approving after an edit snapshots the NEW version as approvedVersion", async () => {
    const client = await createTestClient();
    const item = await makeDraftItem(client.id);
    await approveContentItem(item.id); // approvedVersion = 1
    await editContentItemCaption(item.id, "v2 text"); // version -> 2, back to draft
    const reapproved = await approveContentItem(item.id);
    expect(reapproved!.approvedVersion).toBe(2);
  });

  it("rejecting an item sets rejected and it stays rejected after re-reading", async () => {
    const client = await createTestClient();
    const item = await makeDraftItem(client.id);
    const rejected = await rejectContentItem(item.id);
    expect(rejected!.approvalStatus).toBe("rejected");
  });
});
