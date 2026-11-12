import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { TikTokPage } from "@remotion/captions";

/**
 * Renders one page of word-by-word captions, highlighting whichever word
 * is currently being spoken. Kept in its own file per Remotion's own
 * guidance (captioning logic belongs in a separate component from the
 * Sequence-mapping that drives it) — see display-captions.md.
 */
export const CaptionPage: React.FC<{
  page: TikTokPage;
  highlightColor: string;
  textColor: string;
}> = ({ page, highlightColor, textColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;
  const absoluteTimeMs = page.startMs + currentTimeMs;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 180 }}>
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          fontFamily: "Heebo, Arial, sans-serif",
          whiteSpace: "pre",
          textAlign: "center",
          maxWidth: "85%",
          textShadow: "0 2px 12px rgba(0,0,0,0.6)",
          direction: "rtl",
        }}
      >
        {page.tokens.map((token, tokenIndex) => {
          const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
          return (
            <span
              key={`${token.fromMs}-${tokenIndex}`}
              style={{ color: isActive ? highlightColor : textColor }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
