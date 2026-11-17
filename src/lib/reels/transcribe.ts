import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe as whisperTranscribe,
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
    // tokenLevelTimestamps: true (the previous setting) forces whisper.cpp's
    // --max-len to 1 (one BPE token per output item — confirmed by reading
    // @remotion/install-whisper-cpp's own transcribe.js, where tokensPerItem
    // is hard-coded to 1 whenever tokenLevelTimestamps is true, with no way
    // to override it). For a multi-byte-UTF8 script like Hebrew, that
    // regularly splits one character's UTF-8 bytes across two adjacent
    // tokens, each written to whisper.cpp's own JSON output as its own
    // (now-invalid) "UTF-8" string — confirmed the hard way: Python's strict
    // UTF-8 decoder outright rejects the raw JSON file at the split byte;
    // Node's lenient reader (which @remotion/install-whisper-cpp's readJson
    // uses) instead silently replaces it with U+FFFD, which is why this
    // didn't throw here, just quietly corrupted Hebrew captions character by
    // character. tokensPerItem: 0 (only legal when tokenLevelTimestamps is
    // false — enforced by this function's own TypeScript types) omits
    // --max-len entirely, letting whisper.cpp fall back to its own natural
    // segment boundaries, which this was verified to transcribe correctly.
    // The cost: per-token DTW timestamps are no longer computed — but
    // CaptionPage.tsx's word-highlight already keys off each caption's own
    // startMs/endMs (whisper.cpp's segment offsets), not the DTW-derived
    // timestampMs field, so this has no visible effect on rendered output.
    tokenLevelTimestamps: false,
    tokensPerItem: 0,
    language,
  });

  // Not @remotion/install-whisper-cpp's own toCaptions() — that function
  // reads item.tokens[0], which only exists on the DTW-enabled shape (its
  // own TranscriptionItemWithTimestamp type), and the library's types
  // correctly refuse to let it run on this (safer) non-DTW output. The
  // plain shape here (confirmed against transcribe.d.ts) is just
  // { text, offsets: { from, to } } per item — this is the entire mapping
  // toCaptions() would otherwise do, minus the per-token fields that no
  // longer exist.
  return whisperCppOutput.transcription
    .filter((item) => item.text !== "")
    .map((item, index): Caption => ({
      text: index === 0 ? item.text.trimStart() : item.text,
      startMs: item.offsets.from,
      endMs: item.offsets.to,
      timestampMs: null,
      confidence: null,
    }));
}
