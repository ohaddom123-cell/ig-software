import type Anthropic from "@anthropic-ai/sdk";
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

// Two attempts: tool_choice "auto" doesn't guarantee a tool call, and a
// field over a length limit rejects the whole calendar (see schema.ts), so
// one unusable response shouldn't cost the client their week's plan.
const MAX_ATTEMPTS = 2;

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

// strict: true (with additionalProperties: false and no numeric
// constraints, as strict mode requires) keeps the schema-valid-arguments
// guarantee that forced tool_choice used to give — claude-sonnet-5-5
// rejects forced tool_choice with a 400. Length limits can't be expressed in
// a strict schema, so they're stated in the descriptions and enforced by
// generationResultSchema.
const TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Submit the generated weekly content calendar, one item per requested slot.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slotIndex: { type: "integer", description: "Index of the posting slot this item fills." },
            contentConcept: { type: "string", description: "One-line idea for the post. At most 200 characters." },
            draftCaption: { type: "string", description: "The full post caption. At most 2200 characters." },
            cta: { ...nullableString, description: "Call to action, at most 200 characters, or null if none." },
            sourceReference: {
              type: "string",
              description: "Short note on what in the brief or profile this post is based on. At most 300 characters.",
            },
            needsClarification: { type: "boolean" },
            clarificationNote: {
              ...nullableString,
              description: "What the manager must fill in before approving, at most 500 characters, or null.",
            },
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
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

type CalendarAttempt = { ok: true; items: GeneratedCalendarItem[] } | { ok: false; problem: string };

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

  // Server-side refusal fallback (beta): if the model declines, the API
  // re-runs the same request on a fallback model inside the same call.
  // `fallbacks` and `strict` postdate this SDK version's types, hence the cast.
  const request = {
    model: GENERATION_MODEL,
    // Room for adaptive thinking (on by default for this model) plus a full
    // week of Hebrew captions — 4096 risked truncating the tool input.
    max_tokens: 16000,
    system,
    messages: [{ role: "user" as const, content: user }],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: "auto" as const },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

  let lastProblem = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Beta.Messages.BetaMessage;
    try {
      response = await getAnthropicClient().beta.messages.create(request);
    } catch (err) {
      throw new GenerationError(
        `AI generation request failed (${describeApiError(err)}). The brief has been saved — you can retry generation once this is resolved.`,
        err,
      );
    }

    if (response.stop_reason === "refusal") {
      throw new GenerationError(
        "The AI declined to write this week's plan. The brief has been saved — try rewording the brief and generating again.",
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new GenerationError(
        "The AI's response was cut off before the calendar was complete. The brief has been saved — try generating again.",
      );
    }

    const result = extractCalendar(response, slots);
    if (result.ok) return result.items;
    lastProblem = result.problem;
    console.warn(`Calendar generation attempt ${attempt}/${MAX_ATTEMPTS} unusable: ${lastProblem}`);
  }

  throw new GenerationError(`${lastProblem} The brief has been saved — try generating again.`);
}

function extractCalendar(response: Anthropic.Beta.Messages.BetaMessage, slots: ComputedSlot[]): CalendarAttempt {
  const toolUse = response.content.find(
    (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
  );

  if (!toolUse) {
    return { ok: false, problem: "The AI response didn't include the expected structured output." };
  }

  const parsed = generationResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      problem: `The AI's response didn't match the expected format (${parsed.error.issues.length} validation issue(s): ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}).`,
    };
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
    return {
      ok: false,
      problem: `The AI didn't produce content for ${missing.length} of ${slots.length} slots (missing slot index${missing.length > 1 ? "es" : ""}: ${missing.join(", ")}), so no partial calendar was saved.`,
    };
  }

  return { ok: true, items: results };
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
