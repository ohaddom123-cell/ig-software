import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { contentItems, weeklyBriefs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestClient, addSchedule } from "./helpers";

// Mock the Anthropic boundary only — everything downstream (zod validation,
// slot matching, DB writes, idempotency/locking logic in
// submitWeeklyBrief.ts) runs for real against the real test database. The
// client has exactly one schedule rule in every test below, so there is
// always exactly one slot (index 0) to respond to.
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockImplementation(async () => ({
        content: [
          {
            type: "tool_use",
            name: "generate_weekly_content",
            input: {
              items: [
                {
                  slotIndex: 0,
                  contentConcept: "generated concept",
                  draftCaption: "generated caption",
                  cta: null,
                  sourceReference: "brief",
                  needsClarification: false,
                  clarificationNote: null,
                },
              ],
            },
          },
        ],
      })),
    },
  }),
  GENERATION_MODEL: "claude-sonnet-4-5",
}));

const { submitWeeklyBrief } = await import("@/lib/generation/submitWeeklyBrief");
const { approveContentItem } = await import("@/lib/approval");

describe("weekly brief submission idempotency", () => {
  it("creates a new draft calendar on first submission", async () => {
    const client = await createTestClient();
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    const result = await submitWeeklyBrief({
      clientId: client.id,
      weekStart: "2026-03-01",
      rawIdeas: "promote the sale",
      promotions: "",
      events: "",
      additionalInstructions: "",
    });

    expect(result.regenerated).toBe(true);
    expect(result.generatedCount).toBe(1);

    const items = await db.select().from(contentItems).where(eq(contentItems.briefId, result.briefId));
    expect(items).toHaveLength(1);
    expect(items[0]!.approvalStatus).toBe("draft");
  });

  it("resubmitting the exact same brief text is a true no-op — no duplicate items", async () => {
    const client = await createTestClient();
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    const input = {
      clientId: client.id,
      weekStart: "2026-03-01",
      rawIdeas: "promote the sale",
      promotions: "",
      events: "",
      additionalInstructions: "",
    };

    const first = await submitWeeklyBrief(input);
    const second = await submitWeeklyBrief(input);

    expect(second.regenerated).toBe(false);
    expect(second.briefId).toBe(first.briefId);

    const items = await db.select().from(contentItems).where(eq(contentItems.briefId, first.briefId));
    expect(items).toHaveLength(1); // not 2
  });

  it("an edited resubmission regenerates draft items but never touches an already-approved one", async () => {
    const client = await createTestClient();
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    const first = await submitWeeklyBrief({
      clientId: client.id,
      weekStart: "2026-03-01",
      rawIdeas: "promote the sale",
      promotions: "",
      events: "",
      additionalInstructions: "",
    });

    const [item] = await db.select().from(contentItems).where(eq(contentItems.briefId, first.briefId));
    await approveContentItem(item!.id);

    const second = await submitWeeklyBrief({
      clientId: client.id,
      weekStart: "2026-03-01",
      rawIdeas: "promote the sale — now with a different angle", // changed
      promotions: "",
      events: "",
      additionalInstructions: "",
    });

    expect(second.regenerated).toBe(true);
    expect(second.preservedCount).toBe(1);
    expect(second.generatedCount).toBe(0); // the only slot was locked by approval

    const itemsAfter = await db.select().from(contentItems).where(eq(contentItems.briefId, first.briefId));
    expect(itemsAfter).toHaveLength(1);
    expect(itemsAfter[0]!.approvalStatus).toBe("approved");
    expect(itemsAfter[0]!.currentCaption).toBe("generated caption"); // untouched
  });
});
