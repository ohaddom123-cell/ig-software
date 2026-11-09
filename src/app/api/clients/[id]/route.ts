import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, postingSchedules } from "@/db/schema";
import { clientInputSchema } from "@/lib/validation/client";
import { jsonError, zodError } from "@/lib/api-utils";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) return jsonError("Client not found", 404);

  const schedules = await db
    .select()
    .from(postingSchedules)
    .where(eq(postingSchedules.clientId, id));

  return NextResponse.json({ ...client, schedules });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return jsonError("Invalid JSON body");

  const parsed = clientInputSchema.partial().safeParse(body);
  if (!parsed.success) return zodError(parsed.error);

  const [row] = await db
    .update(clients)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning();

  if (!row) return jsonError("Client not found", 404);
  return NextResponse.json(row);
}
