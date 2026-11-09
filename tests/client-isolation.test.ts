import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentItems, weeklyBriefs } from "@/db/schema";
import { createTestClient } from "./helpers";

describe("client isolation", () => {
  it("content items and briefs for one client never appear when querying another client's data", async () => {
    const clientA = await createTestClient({ name: "Client A", tone: "formal" });
    const clientB = await createTestClient({ name: "Client B", tone: "playful" });

    const [briefA] = await db
      .insert(weeklyBriefs)
      .values({ clientId: clientA.id, weekStart: "2026-01-04", rawIdeas: "A's ideas" })
      .returning();
    const [briefB] = await db
      .insert(weeklyBriefs)
      .values({ clientId: clientB.id, weekStart: "2026-01-04", rawIdeas: "B's ideas" })
      .returning();

    await db.insert(contentItems).values({
      clientId: clientA.id,
      briefId: briefA!.id,
      scheduledAt: new Date(),
      contentConcept: "A concept",
      draftCaption: "A caption",
      currentCaption: "A caption",
    });
    await db.insert(contentItems).values({
      clientId: clientB.id,
      briefId: briefB!.id,
      scheduledAt: new Date(),
      contentConcept: "B concept",
      draftCaption: "B caption",
      currentCaption: "B caption",
    });

    const itemsForA = await db.select().from(contentItems).where(eq(contentItems.clientId, clientA.id));
    const itemsForB = await db.select().from(contentItems).where(eq(contentItems.clientId, clientB.id));

    expect(itemsForA).toHaveLength(1);
    expect(itemsForA[0]!.currentCaption).toBe("A caption");
    expect(itemsForB).toHaveLength(1);
    expect(itemsForB[0]!.currentCaption).toBe("B caption");

    // The brief/tone that would feed the prompt for A never leaks into B's query path.
    expect(itemsForA.some((i) => i.currentCaption.includes("B"))).toBe(false);
  });

  it("the weekly-brief uniqueness constraint is scoped per client, not global", async () => {
    const clientA = await createTestClient({ name: "Client A" });
    const clientB = await createTestClient({ name: "Client B" });

    // Same week, different clients — both must be allowed to have their own brief.
    await db.insert(weeklyBriefs).values({ clientId: clientA.id, weekStart: "2026-02-01", rawIdeas: "x" });
    await expect(
      db.insert(weeklyBriefs).values({ clientId: clientB.id, weekStart: "2026-02-01", rawIdeas: "y" }),
    ).resolves.toBeDefined();
  });
});
