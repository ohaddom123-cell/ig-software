import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { postingSchedules } from "@/db/schema";
import { scheduleRuleInputSchema } from "@/lib/validation/client";
import { jsonError, zodError } from "@/lib/api-utils";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(postingSchedules)
    .where(eq(postingSchedules.clientId, id));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = scheduleRuleInputSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db
    .insert(postingSchedules)
    .values({ clientId: id, ...parsed.data })
    .returning();

  return NextResponse.json(row, { status: 201 });
}
