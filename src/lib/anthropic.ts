import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Lazily constructed so the app can boot (and e.g. serve the dashboard)
 * even before ANTHROPIC_API_KEY is configured — it only throws when a
 * generation is actually attempted, with a message that says exactly what's
 * missing, instead of crashing at import time.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Content generation is implemented but not configured — add the key to .env.local (see .env.example).",
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const GENERATION_MODEL = "claude-sonnet-4-5";
