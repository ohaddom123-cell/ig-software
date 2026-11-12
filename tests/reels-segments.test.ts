import { describe, expect, it } from "vitest";
import {
  computeKeepSegments,
  mapSourceTimeToTrimmedTime,
  totalKeptDurationMs,
} from "@/lib/reels/segments";

describe("computeKeepSegments", () => {
  it("keeps everything when there are no silences", () => {
    expect(computeKeepSegments(10000, [])).toEqual([{ startMs: 0, endMs: 10000 }]);
  });

  it("cuts a single significant silence out of the middle", () => {
    const result = computeKeepSegments(
      10000,
      [{ startMs: 4000, endMs: 6000 }], // 2s silence, well over the default 700ms threshold
      { paddingMs: 0 },
    );
    expect(result).toEqual([
      { startMs: 0, endMs: 4000 },
      { startMs: 6000, endMs: 10000 },
    ]);
  });

  it("ignores short pauses below minSilenceDurationMs (natural speech rhythm, not dead air)", () => {
    const result = computeKeepSegments(10000, [{ startMs: 4000, endMs: 4300 }], {
      minSilenceDurationMs: 700,
    });
    expect(result).toEqual([{ startMs: 0, endMs: 10000 }]);
  });

  it("applies padding so words right next to a cut aren't clipped", () => {
    const result = computeKeepSegments(10000, [{ startMs: 4000, endMs: 6000 }], {
      paddingMs: 200,
    });
    // padding shrinks the silence by 200ms on each side, so more of the
    // original audio survives around the cut
    expect(result).toEqual([
      { startMs: 0, endMs: 4200 },
      { startMs: 5800, endMs: 10000 },
    ]);
  });

  it("merges overlapping/adjacent silences after padding into one gap", () => {
    const result = computeKeepSegments(
      10000,
      [
        { startMs: 2000, endMs: 3000 },
        { startMs: 2900, endMs: 4000 }, // overlaps the first
      ],
      { paddingMs: 0 },
    );
    expect(result).toEqual([
      { startMs: 0, endMs: 2000 },
      { startMs: 4000, endMs: 10000 },
    ]);
  });

  it("drops a leading silence entirely (nothing kept before it)", () => {
    const result = computeKeepSegments(10000, [{ startMs: 0, endMs: 2000 }], { paddingMs: 0 });
    expect(result).toEqual([{ startMs: 2000, endMs: 10000 }]);
  });

  it("drops a trailing silence entirely (nothing kept after it)", () => {
    const result = computeKeepSegments(10000, [{ startMs: 8000, endMs: 10000 }], {
      paddingMs: 0,
    });
    expect(result).toEqual([{ startMs: 0, endMs: 8000 }]);
  });

  it("returns an empty list for a zero-length video", () => {
    expect(computeKeepSegments(0, [])).toEqual([]);
  });
});

describe("totalKeptDurationMs", () => {
  it("sums the kept segments", () => {
    expect(
      totalKeptDurationMs([
        { startMs: 0, endMs: 4000 },
        { startMs: 6000, endMs: 10000 },
      ]),
    ).toBe(8000);
  });

  it("is zero for no kept segments", () => {
    expect(totalKeptDurationMs([])).toBe(0);
  });
});

describe("mapSourceTimeToTrimmedTime", () => {
  const keep = [
    { startMs: 0, endMs: 4000 },
    { startMs: 6000, endMs: 10000 },
  ];

  it("maps a point inside the first kept segment unchanged", () => {
    expect(mapSourceTimeToTrimmedTime(2000, keep)).toBe(2000);
  });

  it("maps a point inside the second kept segment, shifted left by the cut", () => {
    // 2000ms were cut out (4000-6000), so source 7000 -> trimmed 5000
    expect(mapSourceTimeToTrimmedTime(7000, keep)).toBe(5000);
  });

  it("clamps a point inside the cut itself to where the cut lands", () => {
    expect(mapSourceTimeToTrimmedTime(5000, keep)).toBe(4000);
  });

  it("clamps a point past every kept segment to the end", () => {
    expect(mapSourceTimeToTrimmedTime(11000, keep)).toBe(8000);
  });

  it("is a no-op when nothing was cut", () => {
    const noCuts = [{ startMs: 0, endMs: 10000 }];
    expect(mapSourceTimeToTrimmedTime(3456, noCuts)).toBe(3456);
  });
});
