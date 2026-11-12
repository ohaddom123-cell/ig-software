import path from "node:path";
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

export interface TranscribeOptions {
  /** A multilingual model — NOT an ".en" suffixed one, those are
   * English-only and will mangle Hebrew. "medium" balances accuracy and
   * speed reasonably for short reel-length clips. */
  model?: WhisperModel;
  language?: Language;
  whisperHome?: string;
}

/**
 * Transcribes a local WAV file to word-level captions using whisper.cpp,
 * following @remotion/install-whisper-cpp's documented flow exactly
 * (install -> download model -> transcribe -> toCaptions).
 *
 * KNOWN GAP, flagged rather than silently assumed away: this uses
 * standard multilingual Whisper with language="he", which genuinely
 * supports Hebrew — but it is NOT ivrit.ai's Hebrew-fine-tuned model,
 * which would be meaningfully more accurate. Swapping that in means
 * sourcing an ivrit.ai ggml-format model file and placing it where
 * whisper.cpp's model resolution expects it; @remotion/install-whisper-cpp's
 * `model` parameter is typed to the official Whisper model names only, so
 * that swap needs either a small fork of the model-path resolution or a
 * manually-placed file under the same model folder convention. Not done
 * here — this ships with standard multilingual Whisper as a real, working
 * baseline, with the upgrade path documented rather than guessed at.
 *
 * NOT unit-tested — downloads a real model and shells out to a real
 * binary. See transcribe.test note in the test suite for why.
 */
export async function transcribeToCaptions(
  wavPath: string,
  options: TranscribeOptions = {},
): Promise<Caption[]> {
  const whisperHome = options.whisperHome ?? path.join(process.cwd(), ".whisper-cpp");
  const model: WhisperModel = options.model ?? "medium";
  const language: Language = options.language ?? "he";

  await installWhisperCpp({ to: whisperHome, version: WHISPER_CPP_VERSION });
  await downloadWhisperModel({ model, folder: whisperHome });

  const whisperCppOutput = await whisperTranscribe({
    model,
    whisperPath: whisperHome,
    whisperCppVersion: WHISPER_CPP_VERSION,
    inputPath: wavPath,
    tokenLevelTimestamps: true,
    language,
  });

  const { captions } = toCaptions({ whisperCppOutput });
  return captions;
}
