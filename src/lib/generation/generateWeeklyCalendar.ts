import { getAnthropicClient, GENERATION_MODEL } from "../anthropic";
import { generationResultSchema, type GeneratedItem } from "./schema";
import { buildGenerationPrompt, type ClientProfileForPrompt, type HistoricalCaptionForPrompt, type WeeklyBriefForPrompt } from "./prompt";
import type { ComputedSlot } from "../scheduling/computeSlots";

export class GenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GenerationError";
  }
}

export interface GeneratedCalendarItem {
  platform: string;
  scheduledAt: Date;
  contentConcept: string;
  draftCaption: string;
  cta: string | null;
  sourceReference: string;
  needsClarification: boolean;
  clarificationNote: string | null;
}

const TOOL_NAME = "generate_weekly_content";

const TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Submit the generated weekly content calendar, one item per requested slot.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slotIndex: { type: "integer", minimum: 0 },
            contentConcept: { type: "string" },
            draftCaption: { type: "string" },
            cta: { type: ["string", "null"] },
            sourceReference: { type: "string" },
            needsClarification: { type: "boolean" },
            clarificationNote: { type: ["string", "null"] },
          },
          required: [
            "slotIndex",
            "contentConcept",
            "draftCaption",
            "cta",
            "sourceReference",
            "needsClarification",
            "clarificationNote",
          ],
        },
      },
    },
    required: ["items"],
  },
};

/**
 * Generates one content item per slot via Claude, validates the result
 * (schema + "every slot covered exactly once"), and maps items back to the
 * deterministic slots computed by lib/scheduling/computeSlots.ts.
 *
 * Throws GenerationError on anything that would otherwise lead to partial
 * or malformed content being saved — callers must not catch-and-save-anyway.
 */
export async function generateWeeklyCalendar(args: {
  client: ClientProfileForPrompt;
  historicalCaptions: HistoricalCaptionForPrompt[];
  brief: WeeklyBriefForPrompt;
  slots: ComputedSlot[];
}): Promise<GeneratedCalendarItem[]> {
  const { slots } = args;

  if (slots.length === 0) {
    throw new GenerationError(
      "This client has no active posting schedule, so there's nothing to generate. Add a posting schedule for the client first.",
    );
  }

  const { system, user } = buildGenerationPrompt(args);

  let response;
  try {
    const anthropic = getAnthropicClient();
    response = await anthropic.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });
  } catch (err) {
    throw new GenerationError(
      `AI generation request failed (${describeApiError(err)}). The brief has been saved — you can retry generation once this is resolved.`,
      err,
    );
  }

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new GenerationError(
      "The AI response didn't include the expected structured output. The brief has been saved — try generating again.",
    );
  }

  const parsed = generationResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new GenerationError(
      `The AI's response didn't match the expected format (${parsed.error.issues.length} validation issue(s)). The brief has been saved — try generating again. Details: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  const bySlot = new Map<number, GeneratedItem>();
  for (const item of parsed.data.items) {
    bySlot.set(item.slotIndex, item);
  }

  const missing: number[] = [];
  const results: GeneratedCalendarItem[] = [];

  slots.forEach((slot, index) => {
    const item = bySlot.get(index);
    if (!item) {
      missing.push(index);
      return;
    }
    results.push({
      platform: slot.platform,
      scheduledAt: slot.scheduledAt,
      contentConcept: item.contentConcept,
      draftCaption: item.draftCaption,
      cta: item.cta,
      sourceReference: item.sourceReference,
      needsClarification: item.needsClarification,
      clarificationNote: item.clarificationNote,
    });
  });

  if (missing.length > 0) {
    throw new GenerationError(
      `The AI didn't produce content for ${missing.length} of ${slots.length} slots (missing slot index${missing.length > 1 ? "es" : ""}: ${missing.join(", ")}). The brief has been saved — try generating again rather than saving a partial calendar.`,
    );
  }

  return results;
}

function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 429) return "rate limited, status 429";
    if (status === 401) return "authentication failed, status 401 — check ANTHROPIC_API_KEY";
    if (typeof status === "number") return `status ${status}`;
  }
  return err instanceof Error ? err.message : "unknown error";
}
