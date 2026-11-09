import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { historicalPosts } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";
import { parseCsvWithHeader } from "@/lib/csv";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(historicalPosts)
    .where(eq(historicalPosts.clientId, id))
    .orderBy(desc(historicalPosts.publishedAt));
  return NextResponse.json(rows);
}

/**
 * Accepts either:
 *   { csv: "platform,caption,published_at,category,notes\n..." }
 * or a single post directly:
 *   { platform, caption, publishedAt?, category?, notes? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  if (typeof body.csv === "string") {
    const records = parseCsvWithHeader(body.csv);
    const toInsert = records
      .filter((r) => r.caption && r.caption.trim() !== "")
      .map((r) => ({
        clientId: id,
        platform: r.platform || "instagram",
        caption: r.caption ?? "",
        publishedAt: r.published_at || null,
        category: r.category || "",
        notes: r.notes || "",
      }));

    if (toInsert.length === 0) {
      return jsonError(
        'No usable rows found. Expected a header row with at least "caption" (platform, published_at, category, notes are optional).',
      );
    }

    const inserted = await db.insert(historicalPosts).values(toInsert).returning();
    return NextResponse.json({ imported: inserted.length, rows: inserted }, { status: 201 });
  }

  if (typeof body.caption !== "string" || body.caption.trim() === "") {
    return jsonError("caption is required (or supply csv instead)");
  }

  const [row] = await db
    .insert(historicalPosts)
    .values({
      clientId: id,
      platform: body.platform || "instagram",
      caption: body.caption,
      publishedAt: body.publishedAt || null,
      category: body.category || "",
      notes: body.notes || "",
    })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
