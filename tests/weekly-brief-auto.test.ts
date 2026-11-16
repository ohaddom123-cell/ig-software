import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { contentItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestClient, addSchedule } from "./helpers";

// Same mocking boundary as brief-idempotency.test.ts — only the Anthropic
// call is faked, everything else (slot computation, idempotency, DB writes)
// runs for real.
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
                  contentConcept: "auto-generated concept",
                  draftCaption: "auto-generated caption",
                  cta: null,
                  sourceReference: "auto-brief",
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

const { generateDueWeeklyBriefs, nextWeekStart } = await import("@/lib/generation/generateDueWeeklyBriefs");

describe("nextWeekStart", () => {
  it("is always a Sunday strictly after the given date, even when the given date is itself a Sunday", () => {
    for (let i = 0; i < 7; i++) {
      const today = new Date(`2026-03-0${1 + i}T12:00:00Z`); // March 1 2026 is a Sunday
      const result = nextWeekStart(today);
      const resultDate = new Date(`${result}T00:00:00Z`);
      expect(resultDate.getUTCDay()).toBe(0); // Sunday
      expect(resultDate.getTime()).toBeGreaterThan(today.getTime());
      const daysAhead = (resultDate.getTime() - today.getTime()) / 86_400_000;
      expect(daysAhead).toBeGreaterThan(0);
      expect(daysAhead).toBeLessThanOrEqual(7);
    }
  });
});

describe("generateDueWeeklyBriefs", () => {
  it("generates next week's plan for an active client with a posting schedule", async () => {
    const client = await createTestClient({ name: "Active Client" });
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    const results = await generateDueWeeklyBriefs();
    const mine = results.find((r) => r.clientId === client.id);

    expect(mine).toBeDefined();
    expect(mine!.status).toBe("generated");

    const items = await db.select().from(contentItems).where(eq(contentItems.clientId, client.id));
    expect(items.length).toBeGreaterThan(0);
  });

  it("skips inactive clients entirely", async () => {
    const client = await createTestClient({ name: "Inactive Client", active: false });
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    const results = await generateDueWeeklyBriefs();
    expect(results.find((r) => r.clientId === client.id)).toBeUndefined();

    const items = await db.select().from(contentItems).where(eq(contentItems.clientId, client.id));
    expect(items).toHaveLength(0);
  });

  it("reports a client with no posting schedule as skipped, not failed", async () => {
    const client = await createTestClient({ name: "No Schedule Client" });

    const results = await generateDueWeeklyBriefs();
    const mine = results.find((r) => r.clientId === client.id);

    expect(mine).toBeDefined();
    expect(mine!.status).toBe("skipped");
  });

  it("running twice in a row for the same week does not duplicate content items", async () => {
    const client = await createTestClient({ name: "Repeat Client" });
    await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });

    await generateDueWeeklyBriefs();
    await generateDueWeeklyBriefs();

    const items = await db.select().from(contentItems).where(eq(contentItems.clientId, client.id));
    expect(items).toHaveLength(1);
  });
});
