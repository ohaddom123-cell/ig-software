import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, reelItems } from "@/db/schema";
import { renderReel } from "./render";
import { uploadPublicFile } from "./storage";

async function downloadToTemp(url: string, destDir: string): Promise<string> {
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
 * Drives one reel_item through the full pipeline and persists every state
 * transition, so a failure at any step is visible in the dashboard rather
 * than silently losing the job. Designed to run inside a single request
 * (no queue/worker infra) — acceptable at the expected volume of a few
 * reels a week for one business; revisit if that volume grows.
 */
export async function processReelItem(reelId: string): Promise<void> {
  const [reel] = await db.select().from(reelItems).where(eq(reelItems.id, reelId));
  if (!reel) throw new Error(`Reel item ${reelId} not found`);

  const [client] = await db.select().from(clients).where(eq(clients.id, reel.clientId));
  if (!client) throw new Error(`Client ${reel.clientId} not found`);

  await db.update(reelItems).set({ status: "processing", updatedAt: new Date() }).where(eq(reelItems.id, reelId));

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "ig-software-reel-in-"));

  try {
    const rawFootagePath = await downloadToTemp(reel.rawFootageUrl, workDir);

    const result = await renderReel({
      rawFootagePath,
      highlightColor: "#34d399",
      textColor: "#f8fafc",
      language: "he",
    });

    const renderedVideoUrl = await uploadPublicFile(
      result.outputPath,
      `reels/${client.id}/${reelId}.mp4`,
    );

    await db
      .update(reelItems)
      .set({
        status: "ready_for_review",
        keepSegments: result.keepSegments,
        captions: result.captions,
        renderedVideoUrl,
        errorMessage: "",
        updatedAt: new Date(),
      })
      .where(eq(reelItems.id, reelId));
  } catch (err) {
    await db
      .update(reelItems)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error during processing",
        updatedAt: new Date(),
      })
      .where(eq(reelItems.id, reelId));
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
