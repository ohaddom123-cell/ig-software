import { z } from "zod";

/**
 * One generated item, keyed back to a slot WE computed deterministically
 * (see lib/scheduling/computeSlots.ts) rather than trusting the model to do
 * date/cadence math. slotIndex ties the model's output back to that list —
 * this is what guarantees "number of posts == cadence" instead of hoping
 * the model counts correctly.
 */
export const generatedItemSchema = z.object({
  slotIndex: z.number().int().min(0),
  contentConcept: z.string().min(1).max(200),
  draftCaption: z.string().min(1).max(2200), // Instagram's own caption limit
  cta: z.string().max(200).nullable(),
  sourceReference: z.string().max(300),
  needsClarification: z.boolean(),
  clarificationNote: z.string().max(500).nullable(),
});

export const generationResultSchema = z.object({
  items: z.array(generatedItemSchema),
});

export type GeneratedItem = z.infer<typeof generatedItemSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
