import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}:\n${stderr.slice(-2000)}`));
        return;
      }
      resolve();
    });
  });
}

/** Extracts a 16kHz mono WAV from a video/audio file — whisper.cpp's
 * expected input format, per @remotion/install-whisper-cpp's own docs. */
export async function extractWav(inputPath: string, outputWavPath: string): Promise<void> {
  await runFfmpeg(["-i", inputPath, "-ar", "16000", "-ac", "1", outputWavPath, "-y"]);
}

/** Probes duration in milliseconds via ffmpeg's own stderr output (reads
 * the "Duration: HH:MM:SS.xx" line ffmpeg prints for any input). Avoids
 * pulling in a second tool (ffprobe) just for this one number. */
export function probeDurationMs(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, ["-i", inputPath, "-f", "null", "-"]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        reject(new Error(`Could not parse duration from ffmpeg output:\n${stderr.slice(-1000)}`));
        return;
      }
      const [, hh, mm, ss] = match;
      const ms = (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000;
      resolve(Math.round(ms));
    });
  });
}
