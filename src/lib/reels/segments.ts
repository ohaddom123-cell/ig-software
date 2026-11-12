export interface Interval {
  startMs: number;
  endMs: number;
}

export interface KeepSegmentsOptions {
  /** Silences shorter than this are left in place (natural speech pauses
   * shouldn't be cut — only dead air/retakes should). */
  minSilenceDurationMs?: number;
  /** Extra time kept on each side of a cut so words aren't clipped. */
  paddingMs?: number;
}

const DEFAULTS: Required<KeepSegmentsOptions> = {
  minSilenceDurationMs: 700,
  paddingMs: 120,
};

/**
 * Turns detected silence intervals into the segments to actually KEEP —
 * the complement of the silences, after dropping short pauses and adding
 * padding. This is pure interval math; it knows nothing about ffmpeg,
 * audio, or video, which is what makes it fully unit-testable without a
 * real media file (see segments.test.ts).
 */
export function computeKeepSegments(
  totalDurationMs: number,
  silences: Interval[],
  options: KeepSegmentsOptions = {},
): Interval[] {
  const { minSilenceDurationMs, paddingMs } = { ...DEFAULTS, ...options };

  if (totalDurationMs <= 0) return [];

  const significantSilences = silences
    .filter((s) => s.endMs - s.startMs >= minSilenceDurationMs)
    .map((s) => ({
      // Shrink the silence by the padding on each side, so the padding
      // effectively stays in the kept footage around the cut.
      startMs: Math.max(0, s.startMs + paddingMs),
      endMs: Math.min(totalDurationMs, s.endMs - paddingMs),
    }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  const merged: Interval[] = [];
  for (const s of significantSilences) {
    const last = merged[merged.length - 1];
    if (last && s.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, s.endMs);
    } else {
      merged.push({ ...s });
    }
  }

  const keep: Interval[] = [];
  let cursor = 0;
  for (const silence of merged) {
    if (silence.startMs > cursor) {
      keep.push({ startMs: cursor, endMs: silence.startMs });
    }
    cursor = Math.max(cursor, silence.endMs);
  }
  if (cursor < totalDurationMs) {
    keep.push({ startMs: cursor, endMs: totalDurationMs });
  }

  return keep.filter((k) => k.endMs > k.startMs);
}

/** Total duration of the kept footage, i.e. the trimmed video's length. */
export function totalKeptDurationMs(keepSegments: Interval[]): number {
  return keepSegments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
}

/**
 * Maps a point in time on the ORIGINAL (untrimmed) timeline to where it
 * lands on the TRIMMED timeline, given the segments that were kept.
 * A point inside a cut segment (silence that got removed) has no real
 * position in the trimmed output — it's clamped to wherever the cut
 * landed, since that's the closest meaningful place for it.
 */
export function mapSourceTimeToTrimmedTime(sourceMs: number, keepSegments: Interval[]): number {
  let trimmedCursor = 0;

  for (const segment of keepSegments) {
    if (sourceMs < segment.startMs) {
      // Falls in a gap before this segment (i.e. inside a cut) — clamp here.
      return trimmedCursor;
    }
    if (sourceMs <= segment.endMs) {
      return trimmedCursor + (sourceMs - segment.startMs);
    }
    trimmedCursor += segment.endMs - segment.startMs;
  }

  // Past every kept segment (e.g. inside a trailing cut) — clamp to the end.
  return trimmedCursor;
}
