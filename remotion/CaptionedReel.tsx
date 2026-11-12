import React, { useMemo } from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useVideoConfig } from "remotion";
import { z } from "zod";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { CaptionPage } from "./CaptionPage";
import { mapSourceTimeToTrimmedTime } from "../src/lib/reels/segments";

const SWITCH_CAPTIONS_EVERY_MS = 900; // word-by-word-ish, not a full sentence per page

const intervalSchema = z.object({ startMs: z.number(), endMs: z.number() });

// A zod schema (not a plain TS interface) is what Composition's `schema`
// prop needs, and props: index-signature compatible is what its
// `component` prop needs — both come from the same z.infer type here.
export const captionedReelPropsSchema = z.object({
  videoSrc: z.string(),
  /** Segments to keep, in the SOURCE (untrimmed) video's timeline. */
  keepSegments: z.array(intervalSchema),
  /** Captions already remapped onto the TRIMMED timeline — see
   * lib/reels/remapCaptions.ts. This component does not do that mapping
   * itself, so it can't go out of sync with how the video track is cut. */
  captions: z.array(
    z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      timestampMs: z.number().nullable(),
      confidence: z.number().nullable(),
    }),
  ),
  highlightColor: z.string(),
  textColor: z.string(),
});

export type CaptionedReelProps = z.infer<typeof captionedReelPropsSchema>;

export const CaptionedReel: React.FC<CaptionedReelProps> = ({
  videoSrc,
  keepSegments,
  captions,
  highlightColor,
  textColor,
}) => {
  const { fps } = useVideoConfig();

  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS }),
    [captions],
  );

  let trimmedCursorMs = 0;
  const videoSequences = keepSegments.map((segment, index) => {
    const fromFrame = Math.round((trimmedCursorMs / 1000) * fps);
    const segmentDurationMs = segment.endMs - segment.startMs;
    const durationInFrames = Math.max(1, Math.round((segmentDurationMs / 1000) * fps));
    trimmedCursorMs += segmentDurationMs;

    return (
      <Sequence key={index} from={fromFrame} durationInFrames={durationInFrames}>
        <OffthreadVideo
          src={videoSrc}
          startFrom={Math.round((segment.startMs / 1000) * fps)}
          endAt={Math.round((segment.endMs / 1000) * fps)}
          muted={false}
        />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {videoSequences}
      {pages.map((page, index) => {
        const nextPage = pages[index + 1] ?? null;
        const startFrame = Math.round((page.startMs / 1000) * fps);
        const endFrame = Math.min(
          nextPage ? Math.round((nextPage.startMs / 1000) * fps) : Infinity,
          startFrame + Math.round((SWITCH_CAPTIONS_EVERY_MS / 1000) * fps),
        );
        const durationInFrames = endFrame - startFrame;
        if (durationInFrames <= 0) return null;

        return (
          <Sequence key={index} from={startFrame} durationInFrames={durationInFrames}>
            <CaptionPage page={page} highlightColor={highlightColor} textColor={textColor} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Convenience re-export so callers (the render orchestrator) can convert
 * source-timeline instants the same way this component implicitly does,
 * without duplicating the frame math. */
export { mapSourceTimeToTrimmedTime };
