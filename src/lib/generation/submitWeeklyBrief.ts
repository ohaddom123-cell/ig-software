import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems, historicalPosts, postingSchedules, weeklyBriefs } from "@/db/schema";
import { computeSlotsForWeek, type ScheduleRule } from "../scheduling/computeSlots";
import { generateWeeklyCalendar, GenerationError } from "./generateWeeklyCalendar";

export interface BriefInput {
  clientId: string;
  weekStart: string; // YYYY-MM-DD
  rawIdeas: string;
  promotions: string;
  events: string;
  additionalInstructions: string;
}

export interface SubmitBriefResult {
  briefId: string;
  regenerated: boolean;
  preservedCount: number;
  generatedCount: number;
  message: string;
}

/**
 * The one entry point for "manager submits a weekly brief". Handles three
 * cases in one place so the behavior is easy to reason about and test:
 *
 *  1. Brand new week for this client -> generate a fresh calendar.
 *  2. Identical resubmission (same text, same week) -> true no-op. This is
 *     what makes accidentally double-clicking "submit" harmless.
 *  3. Edited resubmission (brief text changed) -> regenerate only the slots
 *     whose content item is still draft/rejected. Anything approved or
 *     posted is left completely untouched — that's the "never silently
 *     overwrite human-approved work" requirement.
 */
export async function submitWeeklyBrief(input: BriefInput): Promise<SubmitBriefResult> {
  const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!client) {
    throw new GenerationError("Client not found.");
  }

  const [existingBrief] = await db
    .select()
    .from(weeklyBriefs)
    .where(and(eq(weeklyBriefs.clientId, input.clientId), eq(weeklyBriefs.weekStart, input.weekStart)));

  const isIdenticalResubmission =
    existingBrief &&
    existingBrief.rawIdeas === input.rawIdeas &&
    existingBrief.promotions === input.promotions &&
    existingBrief.events === input.events &&
    existingBrief.additionalInstructions === input.additionalInstructions;

  if (isIdenticalResubmission) {
    const existingItems = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.briefId, existingBrief.id));
    return {
      briefId: existingBrief.id,
      regenerated: false,
      preservedCount: existingItems.length,
      generatedCount: 0,
      message:
        "This exact brief was already submitted for this week — nothing changed. Edit the ideas above if you want a new calendar.",
    };
  }

  const briefId = await upsertBrief(input, existingBrief?.id);

  const scheduleRows = await db
    .select()
    .from(postingSchedules)
    .where(and(eq(postingSchedules.clientId, input.clientId), eq(postingSchedules.active, true)));

  const rules: ScheduleRule[] = scheduleRows.map((s) => ({
    weekday: s.weekday,
    postingTime: s.postingTime,
    platform: s.platform,
  }));

  const allSlots = computeSlotsForWeek(input.weekStart, rules, client.timezone);

  const existingItems = existingBrief
    ? await db.select().from(contentItems).where(eq(contentItems.briefId, briefId))
    : [];

  const lockedItems = existingItems.filter(
    (i) => i.approvalStatus === "approved" || i.approvalStatus === "posted",
  );
  const lockedKeys = new Set(lockedItems.map((i) => slotKey(i.platform, i.scheduledAt)));

  const slotsToGenerate = allSlots.filter((s) => !lockedKeys.has(slotKey(s.platform, s.scheduledAt)));

  const history = await db
    .select()
    .from(historicalPosts)
    .where(eq(historicalPosts.clientId, input.clientId))
    .limit(20);

  let generatedCount = 0;

  if (slotsToGenerate.length > 0) {
    const generated = await generateWeeklyCalendar({
      client,
      historicalCaptions: history,
      brief: {
        weekStart: input.weekStart,
        rawIdeas: input.rawIdeas,
        promotions: input.promotions,
        events: input.events,
        additionalInstructions: input.additionalInstructions,
      },
      slots: slotsToGenerate,
    });

    for (const item of generated) {
      const existing = existingItems.find(
        (i) => slotKey(i.platform, i.scheduledAt) === slotKey(item.platform, item.scheduledAt),
      );

      if (existing) {
        // Replacing a draft/rejected item (locked ones were already
        // filtered out of slotsToGenerate, so this is always safe).
        await db
          .update(contentItems)
          .set({
            contentConcept: item.contentConcept,
            draftCaption: item.draftCaption,
            currentCaption: item.draftCaption,
            cta: item.cta ?? "",
            sourceReference: item.sourceReference,
            needsClarification: item.needsClarification,
            clarificationNote: item.clarificationNote ?? "",
            approvalStatus: "draft",
            approvedAt: null,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(contentItems.id, existing.id));
      } else {
        await db.insert(contentItems).values({
          clientId: input.clientId,
          briefId,
          platform: item.platform,
          scheduledAt: item.scheduledAt,
          contentConcept: item.contentConcept,
          draftCaption: item.draftCaption,
          currentCaption: item.draftCaption,
          cta: item.cta ?? "",
          sourceReference: item.sourceReference,
          needsClarification: item.needsClarification,
          clarificationNote: item.clarificationNote ?? "",
          isHistoricalReplay: false,
        });
      }
      generatedCount++;
    }
  }

  const preservedCount = lockedItems.length;

  return {
    briefId,
    regenerated: true,
    preservedCount,
    generatedCount,
    message:
      preservedCount > 0
        ? `Generated ${generatedCount} item(s). ${preservedCount} already-approved item(s) for this week were left untouched.`
        : `Generated ${generatedCount} item(s).`,
  };
}

async function upsertBrief(input: BriefInput, existingId?: string): Promise<string> {
  if (existingId) {
    await db
      .update(weeklyBriefs)
      .set({
        rawIdeas: input.rawIdeas,
        promotions: input.promotions,
        events: input.events,
        additionalInstructions: input.additionalInstructions,
      })
      .where(eq(weeklyBriefs.id, existingId));
    return existingId;
  }
  const [row] = await db
    .insert(weeklyBriefs)
    .values({
      clientId: input.clientId,
      weekStart: input.weekStart,
      rawIdeas: input.rawIdeas,
      promotions: input.promotions,
      events: input.events,
      additionalInstructions: input.additionalInstructions,
    })
    .returning();
  if (!row) throw new GenerationError("Failed to save the weekly brief.");
  return row.id;
}

function slotKey(platform: string, scheduledAt: Date): string {
  return `${platform}__${scheduledAt.toISOString()}`;
}
