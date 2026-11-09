import { formatInTimeZone } from "date-fns-tz";
import type { ComputedSlot } from "../scheduling/computeSlots";

export interface ClientProfileForPrompt {
  name: string;
  description: string;
  industry: string;
  audience: string;
  timezone: string;
  tone: string;
  writingStyle: string;
  preferredTerms: string;
  prohibitedTerms: string;
  contentRestrictions: string;
  ctaGuidelines: string;
  productsServices: string;
  additionalNotes: string;
}

export interface HistoricalCaptionForPrompt {
  platform: string;
  caption: string;
  category: string;
  notes: string;
}

export interface WeeklyBriefForPrompt {
  weekStart: string;
  rawIdeas: string;
  promotions: string;
  events: string;
  additionalInstructions: string;
}

const SYSTEM_PROMPT = `You are a social media content planner writing on behalf of a real small business, through its human social media manager. She reviews and approves every single thing you write before anything is posted — nothing you generate goes live automatically.

Your two jobs, in strict priority order:

1. FACTUAL ACCURACY. You must never invent prices, discounts, promotions, product features, dates, opening hours, availability, testimonials, guarantees, or statistics. Only state a fact if it appears in this week's brief. Historical captions are a STYLE reference only — a price or promotion that appeared in a past caption is NOT evidence that it's still valid. If a slot would naturally need a fact the brief doesn't supply, do not invent one: write the best caption you can without it, set needsClarification to true, and explain in clarificationNote exactly what's missing so the manager can fill it in before approving.

2. SOUNDING LIKE THIS SPECIFIC CLIENT. Match their brand tone, writing style, and the rhythm of their historical captions — sentence length, formality, emoji use, hook style, CTA pattern. Do not sound like a generic marketing assistant. Avoid clichés, filler, and caption after caption that all sound like ads. Vary your hooks and structures across the week. Only use a CTA where the brand guidelines call for one. Every post must have a distinct reason to exist in the plan — never generate two posts that say essentially the same thing.

You will be given a fixed list of posting slots (index, platform, local date/time). Produce EXACTLY one content item per slot, referencing it by slotIndex. Do not add slots, remove slots, or renumber them — slot scheduling is handled outside of you.

Respond only by calling the generate_weekly_content tool.`;

export function buildGenerationPrompt(args: {
  client: ClientProfileForPrompt;
  historicalCaptions: HistoricalCaptionForPrompt[];
  brief: WeeklyBriefForPrompt;
  slots: ComputedSlot[];
}): { system: string; user: string } {
  const { client, historicalCaptions, brief, slots } = args;

  const slotLines = slots
    .map((s, i) => {
      const local = formatInTimeZone(s.scheduledAt, client.timezone, "EEEE, d MMM yyyy 'at' HH:mm");
      return `  [${i}] ${s.platform} — ${local} (${client.timezone})`;
    })
    .join("\n");

  const historyBlock =
    historicalCaptions.length > 0
      ? historicalCaptions
          .slice(0, 20)
          .map(
            (h, i) =>
              `  ${i + 1}. [${h.platform}${h.category ? `, ${h.category}` : ""}] ${h.caption}`,
          )
          .join("\n")
      : "  (none provided yet — rely on the brand guidelines below for tone)";

  const user = `
CLIENT PROFILE
  Name: ${client.name}
  Description: ${client.description || "(not provided)"}
  Industry: ${client.industry || "(not provided)"}
  Audience: ${client.audience || "(not provided)"}

BRAND GUIDELINES
  Tone: ${client.tone || "(not provided)"}
  Writing style: ${client.writingStyle || "(not provided)"}
  Preferred terms: ${client.preferredTerms || "(none specified)"}
  Prohibited words/phrases: ${client.prohibitedTerms || "(none specified)"}
  Content restrictions: ${client.contentRestrictions || "(none specified)"}
  CTA guidelines: ${client.ctaGuidelines || "(none specified — use CTAs sparingly and only when it clearly fits)"}
  Products/services: ${client.productsServices || "(not provided)"}
  Additional notes: ${client.additionalNotes || "(none)"}

HISTORICAL CAPTIONS (style reference only — NOT a source of current facts)
${historyBlock}

THIS WEEK'S BRIEF (week starting ${brief.weekStart})
  Raw ideas:
  ${brief.rawIdeas || "(none provided)"}

  Promotions: ${brief.promotions || "(none)"}
  Events: ${brief.events || "(none)"}
  Additional instructions: ${brief.additionalInstructions || "(none)"}

POSTING SLOTS — produce exactly one item per slot, in this order:
${slotLines}
`.trim();

  return { system: SYSTEM_PROMPT, user };
}
