import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { clientInputSchema } from "@/lib/validation/client";
import { jsonError, zodError } from "@/lib/api-utils";
import { desc } from "drizzle-orm";

export async function GET() {
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = clientInputSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db.insert(clients).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
