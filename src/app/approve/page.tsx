import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems } from "@/db/schema";
import { weekRangeFor } from "@/lib/weekRange";
import { ApprovalReview } from "./ApprovalReview";

export const dynamic = "force-dynamic";

export default async function ApprovePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; clientId?: string }>;
}) {
  const { week, clientId } = await searchParams;
  const { weekStart, weekEnd } = weekRangeFor(week);

  const allClients = await db.select().from(clients);

  const conditions = [
    gte(contentItems.scheduledAt, new Date(`${weekStart}T00:00:00Z`)),
    lt(contentItems.scheduledAt, new Date(`${weekEnd}T00:00:00Z`)),
  ];
  if (clientId) conditions.push(eq(contentItems.clientId, clientId));

  const rows = await db
    .select({ item: contentItems, clientName: clients.name, clientTimezone: clients.timezone })
    .from(contentItems)
    .innerJoin(clients, eq(contentItems.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(asc(contentItems.scheduledAt));

  const items = rows.map((r) => ({ ...r.item, clientName: r.clientName, clientTimezone: r.clientTimezone }));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Approval review</h1>
      <p className="mt-1 text-sm text-slate-500">
        Week of {weekStart}. Nothing here triggers a reminder until you approve it.
      </p>
      <ApprovalReview
        items={items}
        clients={allClients.map((c) => ({ id: c.id, name: c.name }))}
        weekStart={weekStart}
        selectedClientId={clientId ?? ""}
      />
    </div>
  );
}
