import React from "react";
import { Composition } from "remotion";
import { CaptionedReel, captionedReelPropsSchema, type CaptionedReelProps } from "./CaptionedReel";
import { totalKeptDurationMs } from "../src/lib/reels/segments";

const FPS = 30;
// Vertical, matches Instagram Reels' native aspect ratio (9:16).
const WIDTH = 1080;
const HEIGHT = 1920;

const defaultProps: CaptionedReelProps = {
  videoSrc: "",
  keepSegments: [{ startMs: 0, endMs: 1000 }],
  captions: [],
  highlightColor: "#34d399",
  textColor: "#f8fafc",
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CaptionedReel"
      component={CaptionedReel}
      durationInFrames={FPS * 1} // placeholder; calculateMetadata overrides this per-render
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      schema={captionedReelPropsSchema}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const durationMs = totalKeptDurationMs(props.keepSegments);
        return {
          durationInFrames: Math.max(1, Math.round((durationMs / 1000) * FPS)),
        };
      }}
    />
  );
};
