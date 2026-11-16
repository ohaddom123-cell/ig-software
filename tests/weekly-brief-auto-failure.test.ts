import { describe, expect, it, vi } from "vitest";
import { createTestClient, addSchedule } from "./helpers";

// Separate file because the mock here always fails the Anthropic call —
// vi.mock is hoisted and file-scoped, so this can't share a file with the
// happy-path mock in weekly-brief-auto.test.ts.
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockRejectedValue(new Error("simulated API outage")),
    },
  }),
  GENERATION_MODEL: "claude-sonnet-4-5",
}));

const { generateDueWeeklyBriefs } = await import("@/lib/generation/generateDueWeeklyBriefs");

describe("generateDueWeeklyBriefs failure isolation", () => {
  it("reports a generation failure as status: failed instead of throwing, and keeps processing other clients", async () => {
    const failing = await createTestClient({ name: "Failing Client" });
    await addSchedule(failing.id, { weekday: 1, postingTime: "09:00" });

    const okClient = await createTestClient({ name: "Fine Client" });
    // No schedule on okClient -> it should still resolve as "skipped", proving
    // the failing client didn't abort the whole run.

    const results = await generateDueWeeklyBriefs();

    const failingResult = results.find((r) => r.clientId === failing.id);
    expect(failingResult).toBeDefined();
    expect(failingResult!.status).toBe("failed");
    expect(failingResult!.detail.length).toBeGreaterThan(0);

    const okResult = results.find((r) => r.clientId === okClient.id);
    expect(okResult).toBeDefined();
    expect(okResult!.status).toBe("skipped");
  });
});
