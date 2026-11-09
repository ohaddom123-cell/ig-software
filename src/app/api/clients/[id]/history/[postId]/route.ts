import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { historicalPosts } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const { postId } = await params;
  const [row] = await db.delete(historicalPosts).where(eq(historicalPosts.id, postId)).returning();
  if (!row) return jsonError("Historical post not found", 404);
  return NextResponse.json({ deleted: true });
}
