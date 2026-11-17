import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe as whisperTranscribe,
  toCaptions,
  type WhisperModel,
  type Language,
} from "@remotion/install-whisper-cpp";
import type { Caption } from "@remotion/captions";

const WHISPER_CPP_VERSION = "1.5.5";

/**
 * ivrit.ai's Hebrew-fine-tuned Whisper, in whisper.cpp's native ggml
 * format — confirmed Apache-2.0 licensed on its Hugging Face model card
 * (https://huggingface.co/ivrit-ai/whisper-v2-d4-ggml), so redistributing
 * and using it here is fine. Not one of @remotion/install-whisper-cpp's
 * official WhisperModel names, so it needs its own download step (that
 * package's downloadWhisperModel always fetches from ggerganov/whisper.cpp's
 * own Hugging Face repo, which doesn't have this file) — everything past
 * the download uses the exact same whisper.cpp binary and transcribe()
 * call as any official model, because getModelPath() (read directly from
 * @remotion/install-whisper-cpp's installed source, not assumed) is just
 * `ggml-${model}.bin` — a plain string template with no allowlist at
 * runtime. The WhisperModel TypeScript union is a compile-time-only
 * guard; this is a deliberate, verified widening of it, not a workaround.
 */
const IVRIT_MODEL_ID = "ivrit-v2-d4";
const IVRIT_MODEL_URL =
  "https://huggingface.co/ivrit-ai/whisper-v2-d4-ggml/resolve/main/ggml-ivrit-v2-d4.bin";

export type HebrewTranscriptionModel = WhisperModel | typeof IVRIT_MODEL_ID;

export interface TranscribeOptions {
  /** A multilingual model — NOT an ".en" suffixed one, those are
   * English-only and will mangle Hebrew. "small" balances accuracy and
   * speed for reel-length clips on Sandbox hardware; "ivrit-v2-d4" is
   * meaningfully more accurate for Hebrew specifically, at the cost of a
   * larger (~3GB) one-time model download into the snapshot. */
  model?: HebrewTranscriptionModel;
  language?: Language;
  whisperHome?: string;
}

async function downloadIvritModel(whisperHome: string): Promise<void> {
  const destPath = path.join(path.resolve(process.cwd(), whisperHome), `ggml-${IVRIT_MODEL_ID}.bin`);
  if (fs.existsSync(destPath)) return;

  const res = await fetch(IVRIT_MODEL_URL);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download the ivrit.ai model (HTTP ${res.status}) from ${IVRIT_MODEL_URL}`);
  }
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.partial`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmpPath));
  await fs.promises.rename(tmpPath, destPath);
}

/**
 * Transcribes a local WAV file to word-level captions using whisper.cpp,
 * following @remotion/install-whisper-cpp's documented flow (install ->
 * download model -> transcribe -> toCaptions), with the ivrit.ai model as
 * a verified, licensed alternative to standard Whisper for Hebrew — see
 * HebrewTranscriptionModel above. Callers (render.ts, processReel.ts)
 * don't need to know which one is in use; this is the only place that
 * branches on it.
 *
 * NOT unit-tested — downloads a real model and shells out to a real
 * binary. See the reel pipeline's other pure-logic tests for what *is*
 * covered without real media.
 */
export async function transcribeToCaptions(
  wavPath: string,
  options: TranscribeOptions = {},
): Promise<Caption[]> {
  const whisperHome = options.whisperHome ?? path.join(process.cwd(), ".whisper-cpp");
  const model: HebrewTranscriptionModel = options.model ?? "small";
  const language: Language = options.language ?? "he";

  await installWhisperCpp({ to: whisperHome, version: WHISPER_CPP_VERSION });

  if (model === IVRIT_MODEL_ID) {
    await downloadIvritModel(whisperHome);
  } else {
    await downloadWhisperModel({ model, folder: whisperHome });
  }

  const whisperCppOutput = await whisperTranscribe({
    model: model as WhisperModel, // see HebrewTranscriptionModel comment above — verified safe widening
    whisperPath: whisperHome,
    whisperCppVersion: WHISPER_CPP_VERSION,
    inputPath: wavPath,
    tokenLevelTimestamps: true,
    language,
  });

  const { captions } = toCaptions({ whisperCppOutput });
  return captions;
}
