import Link from "next/link";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems } from "@/db/schema";
import { weekRangeFor } from "@/lib/weekRange";

export const dynamic = "force-dynamic";

const STATUS_DOT: Record<string, string> = {
  draft: "bg-amber-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  posted: "bg-slate-400",
};

export default async function CalendarPage({
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

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: r.clientTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.item.scheduledAt));
    byDay.set(dayKey, [...(byDay.get(dayKey) ?? []), r]);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Content calendar</h1>
        <Link href={`/approve?week=${weekStart}${clientId ? `&clientId=${clientId}` : ""}`} className="text-sm text-teal-700 underline">
          Go to approval review →
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-500">Week of {weekStart} · read-only overview</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/calendar?week=${weekStart}`}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${!clientId ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          All
        </Link>
        {allClients.map((c) => (
          <Link
            key={c.id}
            href={`/calendar?week=${weekStart}&clientId=${c.id}`}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${clientId === c.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {days.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Nothing scheduled this week yet.</p>
      ) : (
        <div className="mt-6 space-y-5">
          {days.map(([day, dayRows]) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-slate-700">{day}</h2>
              <ul className="mt-2 space-y-1.5">
                {dayRows.map((r) => (
                  <li
                    key={r.item.id}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.item.approvalStatus]}`} />
                    <span className="w-16 shrink-0 text-xs text-slate-500">
                      {new Intl.DateTimeFormat("en-GB", {
                        timeZone: r.clientTimezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(r.item.scheduledAt))}
                    </span>
                    <span className="w-28 shrink-0 font-medium text-slate-900">{r.clientName}</span>
                    <span className="w-20 shrink-0 text-xs text-slate-500">{r.item.platform}</span>
                    <span className="truncate text-slate-600">{r.item.contentConcept}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
