import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, timeTrackingEntries } from "@/db/schema";
import { TimeTrackingForm } from "./TimeTrackingForm";

export const dynamic = "force-dynamic";

export default async function TimeTrackingPage() {
  const allClients = await db.select().from(clients);
  const entries = await db
    .select()
    .from(timeTrackingEntries)
    .orderBy(desc(timeTrackingEntries.weekStart));

  const byClient = new Map<string, typeof entries>();
  for (const e of entries) {
    byClient.set(e.clientId, [...(byClient.get(e.clientId) ?? []), e]);
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-slate-900">Time-saving measurement</h1>
      <p className="mt-1 text-sm text-slate-500">
        The system doesn&apos;t get to claim it saves time just because it generates content.
        Record a baseline week, then pilot weeks, and compare the actual minutes.
      </p>

      <TimeTrackingForm clients={allClients.map((c) => ({ id: c.id, name: c.name }))} />

      <div className="mt-8 space-y-6">
        {allClients.map((client) => {
          const clientEntries = byClient.get(client.id) ?? [];
          if (clientEntries.length === 0) return null;

          const baseline = clientEntries.find((e) => e.kind === "baseline");
          const pilots = clientEntries.filter((e) => e.kind === "pilot");
          const baselineTotal = baseline ? baseline.planningMinutes + baseline.writingMinutes : null;

          return (
            <section key={client.id} className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">{client.name}</h2>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-1">Week</th>
                    <th className="pb-1">Type</th>
                    <th className="pb-1">Planning</th>
                    <th className="pb-1">Writing</th>
                    <th className="pb-1">Total</th>
                    <th className="pb-1">vs baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {clientEntries.map((e) => {
                    const total = e.planningMinutes + e.writingMinutes;
                    const diff =
                      baselineTotal !== null && e.kind === "pilot"
                        ? Math.round(((baselineTotal - total) / baselineTotal) * 100)
                        : null;
                    return (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="py-1.5">{e.weekStart}</td>
                        <td className="py-1.5 capitalize">{e.kind}</td>
                        <td className="py-1.5">{e.planningMinutes}m</td>
                        <td className="py-1.5">{e.writingMinutes}m</td>
                        <td className="py-1.5 font-medium">{total}m</td>
                        <td className="py-1.5">
                          {diff === null ? (
                            "—"
                          ) : (
                            <span className={diff > 0 ? "text-emerald-700" : "text-red-600"}>
                              {diff > 0 ? `${diff}% saved` : `${Math.abs(diff)}% more`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!baseline && pilots.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  No baseline week recorded yet — pilot numbers can&apos;t be compared to anything
                  until there is one.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
