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
import type { HebrewTranscriptionModel } from "./transcribe";

// Centralised, not hardcoded — set WHISPER_MODEL=ivrit-v2-d4 on the
// project (and make sure that model is in the Sandbox snapshot — see
// worker/README.md) for the more accurate, Hebrew-specific model.
// Defaults to "small", a good speed/accuracy balance on Sandbox hardware.
const WHISPER_MODEL = (process.env.WHISPER_MODEL as HebrewTranscriptionModel | undefined) ?? "small";

async function downloadFromUrl(url: string, destDir: string): Promise<string> {
  await assertFootageUrlIsSafe(url);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download raw footage (HTTP ${res.status}) from ${url}`);
  }
  const ext = path.extname(new URL(url).pathname) || ".mp4";
  const destPath = path.join(destDir, `raw${ext}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(destPath, buffer);
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
      highlightColor: "#34d399",
      textColor: "#f8fafc",
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
