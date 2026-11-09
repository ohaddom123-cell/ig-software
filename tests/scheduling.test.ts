import { describe, expect, it } from "vitest";
import { computeSlotsForWeek } from "@/lib/scheduling/computeSlots";

describe("computeSlotsForWeek", () => {
  it("places each slot on the correct day offset from weekStart", () => {
    // 2026-11-08 is a Sunday.
    const slots = computeSlotsForWeek(
      "2026-11-08",
      [
        { weekday: 0, postingTime: "09:00", platform: "instagram" }, // same day as weekStart
        { weekday: 3, postingTime: "09:00", platform: "instagram" }, // Wednesday
        { weekday: 6, postingTime: "09:00", platform: "instagram" }, // Saturday
      ],
      "UTC",
    );

    expect(slots).toHaveLength(3);
    expect(slots[0]!.scheduledAt.toISOString()).toBe("2026-11-08T09:00:00.000Z");
    expect(slots[1]!.scheduledAt.toISOString()).toBe("2026-11-11T09:00:00.000Z");
    expect(slots[2]!.scheduledAt.toISOString()).toBe("2026-11-14T09:00:00.000Z");
  });

  it("returns exactly one slot per rule, matching the platform", () => {
    const slots = computeSlotsForWeek(
      "2026-11-08",
      [
        { weekday: 1, postingTime: "12:00", platform: "instagram" },
        { weekday: 1, postingTime: "18:00", platform: "facebook" },
      ],
      "UTC",
    );
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.platform).sort()).toEqual(["facebook", "instagram"]);
  });

  it("returns an empty list when there are no active rules", () => {
    expect(computeSlotsForWeek("2026-11-08", [], "UTC")).toEqual([]);
  });

  it("converts the client's local posting time correctly across a DST transition", () => {
    // US DST ends 2026-11-01 (clocks fall back). A Monday 09:00 America/New_York
    // slot should be UTC-4 (EDT) the week before, and UTC-5 (EST) the week after —
    // this is what actually proves the conversion is per-slot, not one offset
    // applied to the whole week.
    const beforeDstEnds = computeSlotsForWeek(
      "2026-10-25", // Sunday before the transition
      [{ weekday: 1, postingTime: "09:00", platform: "instagram" }],
      "America/New_York",
    );
    const afterDstEnds = computeSlotsForWeek(
      "2026-11-01", // Sunday of the transition
      [{ weekday: 1, postingTime: "09:00", platform: "instagram" }],
      "America/New_York",
    );

    expect(beforeDstEnds[0]!.scheduledAt.toISOString()).toBe("2026-10-26T13:00:00.000Z"); // EDT, UTC-4
    expect(afterDstEnds[0]!.scheduledAt.toISOString()).toBe("2026-11-02T14:00:00.000Z"); // EST, UTC-5
  });

  it("sorts returned slots chronologically regardless of input order", () => {
    const slots = computeSlotsForWeek(
      "2026-11-08",
      [
        { weekday: 5, postingTime: "09:00", platform: "instagram" },
        { weekday: 1, postingTime: "09:00", platform: "instagram" },
      ],
      "UTC",
    );
    expect(slots[0]!.scheduledAt.getTime()).toBeLessThan(slots[1]!.scheduledAt.getTime());
  });
});
