import { mapSourceTimeToTrimmedTime, type Interval } from "./segments";

/** Matches @remotion/captions' Caption type — duplicated here rather than
 * imported so this module has zero dependency on Remotion to unit test. */
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
}

/**
 * Re-projects captions (word-level timestamps from the transcript of the
 * RAW, untrimmed audio) onto the trimmed timeline that keepSegments
 * describes, so they land in sync with the cut footage instead of the
 * original. A caption whose midpoint falls entirely inside a removed
 * (silent) stretch is dropped — there's no corresponding moment left to
 * show it over.
 */
export function remapCaptionsToTrimmedTimeline(
  captions: Caption[],
  keepSegments: Interval[],
): Caption[] {
  const isKept = (ms: number) => keepSegments.some((s) => ms >= s.startMs && ms <= s.endMs);

  return captions
    .filter((c) => isKept((c.startMs + c.endMs) / 2))
    .map((c) => ({
      ...c,
      startMs: mapSourceTimeToTrimmedTime(c.startMs, keepSegments),
      endMs: mapSourceTimeToTrimmedTime(c.endMs, keepSegments),
      timestampMs:
        c.timestampMs === null ? null : mapSourceTimeToTrimmedTime(c.timestampMs, keepSegments),
    }))
    .filter((c) => c.endMs > c.startMs);
}
