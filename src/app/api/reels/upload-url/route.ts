import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, zodError } from "@/lib/api-utils";
import { storage } from "@/lib/storage";
import { MAX_RAW_FOOTAGE_MB } from "@/lib/reels/limits";

const requestSchema = z.object({
  clientId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
});

// Matches Supabase's own per-file ceiling for the reel-raw bucket (see
// src/lib/storage/setup.ts) — enforced again here so the browser gets a
// clear error before even starting an upload that would be rejected anyway.
// 50MB is this project's actual current ceiling: Supabase's free-tier plan
// caps file size project-wide at 52428800 bytes, confirmed directly against
// this project's own config (raising it needs a paid plan upgrade — a
// billing decision, not something changed here). If the plan is upgraded
// later, raise this, setup.ts's bucket file_size_limit, and limits.ts
// together.
const MAX_FILE_SIZE_MB = MAX_RAW_FOOTAGE_MB;

/**
 * Returns a short-lived signed upload URL so the browser can upload raw
 * footage directly to Supabase Storage — large video files should never
 * be routed through a Next.js API route's own body-size limits.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  // Only the extension survives from the user-supplied file name, and only
  // if it's a short alphanumeric token — anything else (including a
  // crafted name like "video.mp4/../../x", which would otherwise inject
  // "/.." into the storage key) is dropped rather than trusted.
  const rawExt = parsed.data.fileName.slice(parsed.data.fileName.lastIndexOf(".") + 1);
  const ext = /^[a-zA-Z0-9]{1,10}$/.test(rawExt) ? `.${rawExt.toLowerCase()}` : "";
  const destPath = `${parsed.data.clientId}/${randomUUID()}${ext}`;

  try {
    const { key, uploadUrl, token } = await storage.createUploadUrl(destPath, "reel-raw");
    return NextResponse.json({ key, uploadUrl, token, maxFileSizeMb: MAX_FILE_SIZE_MB });
  } catch (err) {
    console.error("Failed to create upload URL:", err);
    return jsonError(
      err instanceof Error ? err.message : "Failed to create an upload URL.",
      503,
    );
  }
}
