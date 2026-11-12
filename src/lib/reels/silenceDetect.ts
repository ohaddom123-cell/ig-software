import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { Interval } from "./segments";

export interface SilenceDetectOptions {
  /** dB threshold below which audio counts as silence. Lower (more
   * negative) = stricter, only very quiet audio counts. */
  noiseThresholdDb?: number;
  /** Minimum duration, in seconds, for a quiet stretch to be reported. */
  minDurationSec?: number;
}

const DEFAULTS: Required<SilenceDetectOptions> = {
  noiseThresholdDb: -30,
  minDurationSec: 0.5,
};

/**
 * Runs ffmpeg's `silencedetect` filter over a local media file and parses
 * its stderr output (ffmpeg reports filter results on stderr, not stdout —
 * this is standard ffmpeg behavior, not a bug) into silence intervals in
 * milliseconds. Uses the statically-bundled ffmpeg binary from
 * `ffmpeg-static` rather than assuming a system install, since that's not
 * guaranteed in a serverless/Vercel render environment.
 *
 * NOT unit-tested in this codebase — it shells out to a real binary and
 * needs a real media file. The pure interval math it feeds
 * (computeKeepSegments) is what's actually tested; see segments.test.ts.
 */
export function detectSilences(
  inputPath: string,
  options: SilenceDetectOptions = {},
): Promise<Interval[]> {
  const { noiseThresholdDb, minDurationSec } = { ...DEFAULTS, ...options };

  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${noiseThresholdDb}dB:d=${minDurationSec}`,
      "-f",
      "null",
      "-",
    ];

    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", (code) => {
      // ffmpeg exits 0 even when it finds no silences — a non-zero code
      // here means the run itself failed (bad input, unsupported codec).
      if (code !== 0) {
        reject(new Error(`ffmpeg silencedetect exited with code ${code}:\n${stderr.slice(-2000)}`));
        return;
      }
      try {
        resolve(parseSilenceDetectOutput(stderr));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * ffmpeg prints lines like:
 *   [silencedetect @ 0x...] silence_start: 4.012
 *   [silencedetect @ 0x...] silence_end: 6.231 | silence_duration: 2.219
 * A trailing silence_start with no matching silence_end (the clip ends
 * while still silent) is closed at the end of the log — ffmpeg doesn't
 * print a matching silence_end in that case, so the caller supplies the
 * true duration separately if that edge needs handling precisely; here we
 * simply drop a dangling silence_start, which is the conservative choice
 * (under-cutting, never over-cutting).
 */
export function parseSilenceDetectOutput(stderr: string): Interval[] {
  const intervals: Interval[] = [];
  let pendingStart: number | null = null;

  const startRe = /silence_start:\s*(-?\d+(?:\.\d+)?)/;
  const endRe = /silence_end:\s*(-?\d+(?:\.\d+)?)/;

  for (const line of stderr.split("\n")) {
    const startMatch = line.match(startRe);
    if (startMatch) {
      pendingStart = Math.max(0, Math.round(parseFloat(startMatch[1]!) * 1000));
      continue;
    }
    const endMatch = line.match(endRe);
    if (endMatch && pendingStart !== null) {
      const endMs = Math.round(parseFloat(endMatch[1]!) * 1000);
      intervals.push({ startMs: pendingStart, endMs });
      pendingStart = null;
    }
  }

  return intervals;
}
