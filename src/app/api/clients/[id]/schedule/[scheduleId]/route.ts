import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { postingSchedules } from "@/db/schema";
import { jsonError } from "@/lib/api-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  const { scheduleId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.active !== "boolean") {
    return jsonError('Expected { "active": boolean }');
  }

  const [row] = await db
    .update(postingSchedules)
    .set({ active: body.active })
    .where(eq(postingSchedules.id, scheduleId))
    .returning();

  if (!row) return jsonError("Schedule rule not found", 404);
  return NextResponse.json(row);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; scheduleId: string }> },
) {
  const { scheduleId } = await params;
  const [row] = await db
    .delete(postingSchedules)
    .where(eq(postingSchedules.id, scheduleId))
    .returning();

  if (!row) return jsonError("Schedule rule not found", 404);
  return NextResponse.json({ deleted: true });
}
