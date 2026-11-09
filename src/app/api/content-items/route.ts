import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, gte, lt, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems } from "@/db/schema";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");
  const weekEnd = searchParams.get("weekEnd");
  const clientId = searchParams.get("clientId");
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");

  const conditions: SQL[] = [];
  if (weekStart) conditions.push(gte(contentItems.scheduledAt, new Date(weekStart)));
  if (weekEnd) conditions.push(lt(contentItems.scheduledAt, new Date(weekEnd)));
  if (clientId) conditions.push(eq(contentItems.clientId, clientId));
  if (platform) conditions.push(eq(contentItems.platform, platform));
  if (status) conditions.push(eq(contentItems.approvalStatus, status as "draft" | "approved" | "rejected" | "posted"));

  const rows = await db
    .select({
      item: contentItems,
      clientName: clients.name,
    })
    .from(contentItems)
    .innerJoin(clients, eq(contentItems.clientId, clients.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(contentItems.scheduledAt));

  return NextResponse.json(
    rows.map((r) => ({ ...r.item, clientName: r.clientName })),
  );
}
