import { z } from "zod";

export const clientInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().default(""),
  industry: z.string().default(""),
  audience: z.string().default(""),
  timezone: z.string().min(1).default("Asia/Jerusalem"),
  tone: z.string().default(""),
  writingStyle: z.string().default(""),
  preferredTerms: z.string().default(""),
  prohibitedTerms: z.string().default(""),
  contentRestrictions: z.string().default(""),
  ctaGuidelines: z.string().default(""),
  productsServices: z.string().default(""),
  additionalNotes: z.string().default(""),
  active: z.boolean().optional(),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export const scheduleRuleInputSchema = z.object({
  platform: z.string().min(1).default("instagram"),
  weekday: z.number().int().min(0).max(6),
  postingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Use HH:mm (24h)"),
});

export type ScheduleRuleInput = z.infer<typeof scheduleRuleInputSchema>;
