import { describe, expect, it } from "vitest";
import { remapCaptionsToTrimmedTimeline, type Caption } from "@/lib/reels/remapCaptions";

function caption(text: string, startMs: number, endMs: number): Caption {
  return { text, startMs, endMs, timestampMs: startMs, confidence: 1 };
}

describe("remapCaptionsToTrimmedTimeline", () => {
  const keepSegments = [
    { startMs: 0, endMs: 4000 },
    { startMs: 6000, endMs: 10000 },
  ];

  it("shifts captions after a cut to their new trimmed position", () => {
    const captions = [caption("hello", 1000, 1500), caption("world", 7000, 7500)];
    const result = remapCaptionsToTrimmedTimeline(captions, keepSegments);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: "hello", startMs: 1000, endMs: 1500 });
    // 2000ms cut out before 7000/7500 -> shifted to 5000/5500
    expect(result[1]).toMatchObject({ text: "world", startMs: 5000, endMs: 5500 });
  });

  it("drops a caption whose midpoint falls inside a cut silence", () => {
    const captions = [caption("um", 4500, 5500)]; // midpoint 5000, inside the 4000-6000 gap
    const result = remapCaptionsToTrimmedTimeline(captions, keepSegments);
    expect(result).toEqual([]);
  });

  it("keeps caption order stable", () => {
    const captions = [
      caption("one", 500, 900),
      caption("two", 1000, 1400),
      caption("three", 7000, 7400),
    ];
    const result = remapCaptionsToTrimmedTimeline(captions, keepSegments);
    expect(result.map((c) => c.text)).toEqual(["one", "two", "three"]);
  });

  it("preserves a null timestampMs instead of mapping it", () => {
    const captions: Caption[] = [
      { text: "x", startMs: 100, endMs: 200, timestampMs: null, confidence: null },
    ];
    const result = remapCaptionsToTrimmedTimeline(captions, keepSegments);
    expect(result[0]!.timestampMs).toBeNull();
  });

  it("returns an empty list when every caption falls in cut silence", () => {
    const captions = [caption("gone", 4100, 4900)];
    expect(remapCaptionsToTrimmedTimeline(captions, keepSegments)).toEqual([]);
  });
});
