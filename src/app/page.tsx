import Link from "next/link";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentItems, reminderDeliveries } from "@/db/schema";
import { weekRangeFor } from "@/lib/weekRange";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "bad" | "good" }) {
  const toneClass =
    tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const { weekStart, weekEnd } = weekRangeFor();

  const [clientCount] = await db.select({ count: sql<number>`count(*)::int` }).from(clients);

  const weekConditions = [
    gte(contentItems.scheduledAt, new Date(`${weekStart}T00:00:00Z`)),
    lt(contentItems.scheduledAt, new Date(`${weekEnd}T00:00:00Z`)),
    eq(contentItems.isHistoricalReplay, false),
  ];

  const weekItems = await db
    .select({ status: contentItems.approvalStatus, count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(...weekConditions))
    .groupBy(contentItems.approvalStatus);

  const statusCounts = Object.fromEntries(weekItems.map((r) => [r.status, r.count]));
  const totalThisWeek = weekItems.reduce((sum, r) => sum + r.count, 0);

  const upcoming = await db
    .select({ item: contentItems, clientName: clients.name, clientTimezone: clients.timezone })
    .from(contentItems)
    .innerJoin(clients, eq(contentItems.clientId, clients.id))
    .where(and(eq(contentItems.approvalStatus, "approved"), gte(contentItems.scheduledAt, new Date())))
    .orderBy(asc(contentItems.scheduledAt))
    .limit(5);

  const failedReminders = await db
    .select({ delivery: reminderDeliveries, clientName: clients.name, concept: contentItems.contentConcept })
    .from(reminderDeliveries)
    .innerJoin(contentItems, eq(reminderDeliveries.contentItemId, contentItems.id))
    .innerJoin(clients, eq(contentItems.clientId, clients.id))
    .where(eq(reminderDeliveries.deliveryStatus, "failed"));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">Week of {weekStart}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Clients" value={clientCount?.count ?? 0} />
        <StatCard label="Posts this week" value={totalThisWeek} />
        <StatCard label="Awaiting approval" value={statusCounts.draft ?? 0} tone={statusCounts.draft ? "warn" : undefined} />
        <StatCard label="Approved" value={statusCounts.approved ?? 0} tone="good" />
        <StatCard label="Rejected" value={statusCounts.rejected ?? 0} />
        <StatCard label="Failed reminders" value={failedReminders.length} tone={failedReminders.length ? "bad" : undefined} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Upcoming reminders</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing approved and upcoming right now.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {upcoming.map((u) => (
                <li key={u.item.id} className="text-sm">
                  <span className="font-medium text-slate-900">{u.clientName}</span>{" "}
                  <span className="text-slate-500">
                    · {u.item.platform} ·{" "}
                    {new Intl.DateTimeFormat("en-GB", {
                      timeZone: u.clientTimezone,
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(u.item.scheduledAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Failed reminders</h2>
          {failedReminders.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">None.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {failedReminders.map((f) => (
                <li key={f.delivery.id} className="text-sm">
                  <span className="font-medium text-slate-900">{f.clientName}</span>{" "}
                  <span className="text-slate-500">— {f.concept}</span>
                  <p className="text-xs text-red-600">{f.delivery.lastError}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(statusCounts.draft ?? 0) > 0 && (
        <Link
          href="/approve"
          className="mt-6 inline-block rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Review {statusCounts.draft} item{statusCounts.draft === 1 ? "" : "s"} awaiting approval →
        </Link>
      )}
    </div>
  );
}
