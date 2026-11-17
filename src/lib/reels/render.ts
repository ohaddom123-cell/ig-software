import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Language } from "@remotion/install-whisper-cpp";
import type { HebrewTranscriptionModel } from "./transcribe";

import { computeKeepSegments } from "./segments";
import { remapCaptionsToTrimmedTimeline } from "./remapCaptions";
import { detectSilences } from "./silenceDetect";
import { extractWav, probeDurationMs } from "./media";
import { transcribeToCaptions } from "./transcribe";
import type { CaptionedReelProps } from "../../../remotion/CaptionedReel";

export interface RenderReelOptions {
  /** Local path to the raw footage file (already downloaded from wherever
   * it was uploaded — this function doesn't fetch remote URLs itself). */
  rawFootagePath: string;
  highlightColor: string;
  textColor: string;
  language?: Language;
  whisperModel?: HebrewTranscriptionModel;
  onProgress?: (step: string, fraction: number) => void;
}

export interface RenderReelResult {
  outputPath: string;
  keepSegments: { startMs: number; endMs: number }[];
  captions: CaptionedReelProps["captions"];
}

/**
 * The full pipeline: raw footage in, captioned+trimmed mp4 out. This is
 * real code against verified APIs (every Remotion/whisper-cpp call here
 * was checked against this project's actually-installed package
 * versions, not recalled from memory), but it has NOT been executed
 * end-to-end in this session — that needs a real video file with real
 * speech, a downloaded Whisper model, and a render environment capable of
 * launching headless Chrome, none of which this sandbox reliably has on
 * hand. Treat this as implemented-and-type-checked, not
 * implemented-and-proven; run it once against a real clip before trusting
 * it on a live job. See README's Definition of Done for the same
 * distinction applied to the rest of the app.
 */
export async function renderReel(options: RenderReelOptions): Promise<RenderReelResult> {
  const { rawFootagePath, highlightColor, textColor, onProgress } = options;

  onProgress?.("probing", 0);
  const durationMs = await probeDurationMs(rawFootagePath);

  onProgress?.("detecting silences", 0.1);
  const silences = await detectSilences(rawFootagePath);
  const keepSegments = computeKeepSegments(durationMs, silences);

  if (keepSegments.length === 0) {
    throw new Error(
      "Silence detection removed the entire clip — it may be silent throughout, or the noise threshold needs adjusting. Nothing to render.",
    );
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-software-reel-"));
  const wavPath = path.join(workDir, "audio.wav");
  const outputPath = path.join(workDir, "output.mp4");

  try {
    onProgress?.("extracting audio", 0.2);
    await extractWav(rawFootagePath, wavPath);

    onProgress?.("transcribing", 0.3);
    const rawCaptions = await transcribeToCaptions(wavPath, {
      language: options.language,
      model: options.whisperModel,
    });
    const captions = remapCaptionsToTrimmedTimeline(rawCaptions, keepSegments);

    onProgress?.("bundling composition", 0.6);
    const serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    });

    const inputProps: CaptionedReelProps = {
      // Remotion's own getAbsoluteSrc() (read directly from the installed
      // package: node_modules/remotion/dist/cjs/absolute-src.js) only
      // recognizes http(s)://, file://, blob: and data: prefixes — any
      // other string (including a plain OS-absolute path) gets resolved
      // via `new URL(src, document.baseURI)`, i.e. against the bundler's
      // own dev-server origin. Confirmed the hard way: without this
      // file:// prefix, OffthreadVideo requested
      // http://localhost:3000/tmp/<rawFootagePath>, which 404s, since
      // that path was never served there. file:// makes Remotion read the
      // raw footage directly from disk instead.
      videoSrc: pathToFileURL(rawFootagePath).href,
      keepSegments,
      captions,
      highlightColor,
      textColor,
    };

    onProgress?.("selecting composition", 0.7);
    const composition = await selectComposition({
      serveUrl,
      id: "CaptionedReel",
      inputProps,
    });

    onProgress?.("rendering", 0.75);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => onProgress?.("rendering", 0.75 + progress * 0.25),
    });

    onProgress?.("done", 1);
    return { outputPath, keepSegments, captions };
  } catch (err) {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
