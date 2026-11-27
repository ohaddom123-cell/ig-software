import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, reelItems } from "@/db/schema";
import { renderReel } from "./render";
import { storage } from "@/lib/storage";
import { reportProgress, markFailed } from "./jobQueue";
import { assertFootageUrlIsSafe } from "./validateFootageUrl";
import { MAX_RAW_FOOTAGE_MB } from "./limits";
import type { HebrewTranscriptionModel } from "./transcribe";

// Centralised, not hardcoded — set WHISPER_MODEL=ivrit-v2-d4 on the
// project (and make sure that model is in the Sandbox snapshot — see
// worker/README.md) for the more accurate, Hebrew-specific model.
// Defaults to "small", a good speed/accuracy balance on Sandbox hardware.
// `|| "small"`, not `?? "small"`: an unset WHISPER_MODEL can legitimately
// arrive here as "" (triggerWorker.ts forwards it into the Sandbox env
// unconditionally, and an unset env var on the Vercel project side
// becomes an empty string once it round-trips through there) — confirmed
// by a real job failing with "Invalid whisper model ." instead of
// defaulting, since `??` only treats null/undefined as missing, not "".
const WHISPER_MODEL = (process.env.WHISPER_MODEL as HebrewTranscriptionModel | undefined) || "small";

const MAX_RAW_FOOTAGE_BYTES = MAX_RAW_FOOTAGE_MB * 1024 * 1024;

// The direct-upload path is capped at MAX_RAW_FOOTAGE_MB by the Supabase
// bucket itself (enforced server-side on upload) — a URL import has no
// such backstop, so this function has to enforce the same limit itself.
// Without it, a worker fetching an arbitrarily large (or just slow,
// unbounded) URL could exhaust Sandbox disk/memory on a single job.
async function downloadFromUrl(url: string, destDir: string): Promise<string> {
  await assertFootageUrlIsSafe(url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download raw footage (HTTP ${res.status}) from ${url}`);
  }
  const declaredLength = Number(res.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_RAW_FOOTAGE_BYTES) {
    throw new Error(
      `Raw footage URL reports a size of ${Math.round(declaredLength / 1024 / 1024)}MB, over the ${MAX_RAW_FOOTAGE_MB}MB limit.`,
    );
  }
  if (!res.body) {
    throw new Error("Raw footage URL returned an empty response body.");
  }

  const ext = path.extname(new URL(url).pathname) || ".mp4";
  const destPath = path.join(destDir, `raw${ext}`);
  let total = 0;
  const chunks: Uint8Array[] = [];
  // Content-Length can be absent or lied about, so the real limit is
  // enforced while streaming too, not just from the header.
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > MAX_RAW_FOOTAGE_BYTES) {
      throw new Error(
        `Raw footage from this URL exceeds the ${MAX_RAW_FOOTAGE_MB}MB limit — stopped downloading partway through.`,
      );
    }
    chunks.push(chunk);
  }
  await fs.writeFile(destPath, Buffer.concat(chunks));
  return destPath;
}

/**
 * Drives one already-claimed reel_item through the full pipeline (see
 * jobQueue.ts for claiming) and persists every state transition, so a
 * failure at any step is visible rather than silently lost. Runs inside
 * the Sandbox worker now, not inside a Next.js request — see
 * worker/run.ts. Assumes the caller already set status appropriately via
 * claimNextReelJob (status starts at "downloading" on entry here).
 */
export async function processReelItem(reelId: string): Promise<void> {
  const [reel] = await db.select().from(reelItems).where(eq(reelItems.id, reelId));
  if (!reel) throw new Error(`Reel item ${reelId} not found`);

  const [client] = await db.select().from(clients).where(eq(clients.id, reel.clientId));
  if (!client) throw new Error(`Client ${reel.clientId} not found`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-software-reel-in-"));

  try {
    await reportProgress(reelId, "downloading", "downloading raw footage");
    const rawFootagePath = reel.rawFootageStorageKey
      ? await (async () => {
          const dest = path.join(workDir, "raw-upload.mp4");
          await storage.download(reel.rawFootageStorageKey as string, "reel-raw", dest);
          return dest;
        })()
      : await downloadFromUrl(reel.rawFootageUrl, workDir);

    const result = await renderReel({
      rawFootagePath,
      // Classic TikTok-style captions: plain white text, with whichever
      // word is currently being spoken highlighted in yellow.
      highlightColor: "#facc15",
      textColor: "#ffffff",
      language: "he",
      whisperModel: WHISPER_MODEL,
      onProgress: async (step) => {
        const stageMap: Record<string, (typeof reelItems.$inferSelect)["status"]> = {
          probing: "downloading",
          "detecting silences": "editing",
          "extracting audio": "editing",
          transcribing: "transcribing",
          "bundling composition": "rendering",
          "selecting composition": "rendering",
          rendering: "rendering",
          done: "uploading",
        };
        const status = stageMap[step] ?? "rendering";
        await reportProgress(reelId, status, step).catch(() => {});
      },
    });

    await reportProgress(reelId, "uploading", "uploading finished video");
    const { key: outputStorageKey } = await storage.upload(
      result.outputPath,
      `${client.id}/${reelId}.mp4`,
      "reel-output",
    );

    // renderReel's own temp directory (the extracted WAV and the rendered
    // output video) isn't cleaned up on its success path — only on error
    // (see render.ts) — because it still needs to exist for the upload
    // above. This is the first safe point to remove it: right after the
    // upload has read it, inside the same outer try so a failure here
    // still routes through the catch below rather than leaking silently.
    await fs.rm(path.dirname(result.outputPath), { recursive: true, force: true }).catch(() => {});

    // Verify the output is actually retrievable before telling anyone the
    // job succeeded — storage.upload() not throwing means Supabase's API
    // accepted the object, but this is the same signed-URL call the
    // frontend will depend on, so confirming it works now is a real
    // pre-completion check, not just trusting the upload call's own
    // success response.
    await storage.getSignedUrl(outputStorageKey, "reel-output");

    await db
      .update(reelItems)
      .set({
        status: "ready_for_review",
        keepSegments: result.keepSegments,
        captions: result.captions,
        outputStorageKey,
        errorMessage: "",
        progressStage: "",
        updatedAt: new Date(),
      })
      .where(eq(reelItems.id, reelId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during processing";
    await markFailed(reelId, message);
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
