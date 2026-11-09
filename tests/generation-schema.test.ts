import { describe, expect, it } from "vitest";
import { generationResultSchema } from "@/lib/generation/schema";

describe("generationResultSchema", () => {
  it("accepts a well-formed response", () => {
    const result = generationResultSchema.safeParse({
      items: [
        {
          slotIndex: 0,
          contentConcept: "Announce the new menu",
          draftCaption: "Our new winter menu just dropped 🍂",
          cta: "Book a table",
          sourceReference: "raw idea #1",
          needsClarification: false,
          clarificationNote: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing a required field", () => {
    const result = generationResultSchema.safeParse({
      items: [
        {
          slotIndex: 0,
          contentConcept: "Announce the new menu",
          // draftCaption missing
          cta: null,
          sourceReference: "",
          needsClarification: false,
          clarificationNote: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a caption over Instagram's length limit", () => {
    const result = generationResultSchema.safeParse({
      items: [
        {
          slotIndex: 0,
          contentConcept: "x",
          draftCaption: "a".repeat(2201),
          cta: null,
          sourceReference: "",
          needsClarification: false,
          clarificationNote: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean needsClarification instead of silently coercing it", () => {
    const result = generationResultSchema.safeParse({
      items: [
        {
          slotIndex: 0,
          contentConcept: "x",
          draftCaption: "y",
          cta: null,
          sourceReference: "",
          needsClarification: "false", // string, not boolean
          clarificationNote: null,
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty items array (e.g. nothing to generate)", () => {
    expect(generationResultSchema.safeParse({ items: [] }).success).toBe(true);
  });
});
