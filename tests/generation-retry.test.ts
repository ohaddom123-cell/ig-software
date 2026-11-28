import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { contentItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTestClient, addSchedule } from "./helpers";

const create = vi.fn();

vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ beta: { messages: { create } } }),
  GENERATION_MODEL: "claude-sonnet-5-5",
}));

const { submitWeeklyBrief } = await import("@/lib/generation/submitWeeklyBrief");
const { GenerationError } = await import("@/lib/generation/generateWeeklyCalendar");

const validCalendar = {
  stop_reason: "tool_use",
  content: [
    {
      type: "tool_use",
      name: "generate_weekly_content",
      input: {
        items: [
          {
            slotIndex: 0,
            contentConcept: "concept",
            draftCaption: "caption",
            cta: null,
            sourceReference: "brief",
            needsClarification: false,
            clarificationNote: null,
          },
        ],
      },
    },
  ],
};

const noToolCall = { stop_reason: "end_turn", content: [{ type: "text", text: "Here is your calendar..." }] };

async function clientWithOneSlot() {
  const client = await createTestClient();
  await addSchedule(client.id, { weekday: 1, postingTime: "09:00" });
  return client;
}

const brief = (clientId: string) => ({
  clientId,
  weekStart: "2026-03-01",
  rawIdeas: "",
  promotions: "",
  events: "",
  additionalInstructions: "",
});

beforeEach(() => {
  create.mockReset();
});

describe("calendar generation retries", () => {
  it("resubmitting an unchanged brief after a failed generation retries instead of no-opping", async () => {
    const client = await clientWithOneSlot();

    create.mockRejectedValueOnce(new Error("simulated API outage"));
    await expect(submitWeeklyBrief(brief(client.id))).rejects.toBeInstanceOf(GenerationError);

    create.mockResolvedValueOnce(validCalendar);
    const retry = await submitWeeklyBrief(brief(client.id));

    expect(retry.regenerated).toBe(true);
    expect(retry.generatedCount).toBe(1);
    const items = await db.select().from(contentItems).where(eq(contentItems.briefId, retry.briefId));
    expect(items).toHaveLength(1);
  });

  it("retries once when the model answers without calling the tool", async () => {
    const client = await clientWithOneSlot();
    create.mockResolvedValueOnce(noToolCall).mockResolvedValueOnce(validCalendar);

    const result = await submitWeeklyBrief(brief(client.id));

    expect(result.generatedCount).toBe(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives up after two unusable responses without saving a partial calendar", async () => {
    const client = await clientWithOneSlot();
    create.mockResolvedValue(noToolCall);

    await expect(submitWeeklyBrief(brief(client.id))).rejects.toBeInstanceOf(GenerationError);
    expect(create).toHaveBeenCalledTimes(2);
    expect(await db.select().from(contentItems).where(eq(contentItems.clientId, client.id))).toHaveLength(0);
  });

  it("does not retry a refusal", async () => {
    const client = await clientWithOneSlot();
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });

    await expect(submitWeeklyBrief(brief(client.id))).rejects.toThrow(/declined/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("sends a request the current model accepts: no forced tool_choice, strict schema", async () => {
    const client = await clientWithOneSlot();
    create.mockResolvedValueOnce(validCalendar);

    await submitWeeklyBrief(brief(client.id));

    const request = create.mock.calls[0]![0];
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.tool_choice).toEqual({ type: "auto" });
    expect(request.tools[0].strict).toBe(true);
    expect(JSON.stringify(request.tools[0].input_schema)).not.toContain("minimum");
  });
});
