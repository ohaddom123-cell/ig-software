import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { timeTrackingEntries } from "@/db/schema";
import { jsonError, zodError } from "@/lib/api-utils";

const entrySchema = z.object({
  clientId: z.string().uuid(),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["baseline", "pilot"]),
  planningMinutes: z.number().int().min(0),
  writingMinutes: z.number().int().min(0),
  notes: z.string().default(""),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("clientId");

  const rows = clientId
    ? await db
        .select()
        .from(timeTrackingEntries)
        .where(eq(timeTrackingEntries.clientId, clientId))
        .orderBy(desc(timeTrackingEntries.weekStart))
    : await db.select().from(timeTrackingEntries).orderBy(desc(timeTrackingEntries.weekStart));

  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db.insert(timeTrackingEntries).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
