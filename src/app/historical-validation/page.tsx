import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { HistoricalValidationForm } from "./HistoricalValidationForm";

export const dynamic = "force-dynamic";

export default async function HistoricalValidationPage() {
  const allClients = await db.select().from(clients);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900">Historical validation</h1>
      <p className="mt-1 text-sm text-slate-500">
        Before trusting this on a live week, test it against a week that already happened.
        Reconstruct that week&apos;s brief, generate a retrospective calendar, and compare it
        against what you actually posted. This never sends a reminder and never touches your
        live calendar — generated items here are tagged as historical replay and the reminder
        system ignores them entirely.
      </p>

      {allClients.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No clients yet. <a className="text-teal-700 underline" href="/clients/new">Add one first</a>.
        </p>
      ) : (
        <HistoricalValidationForm clients={allClients.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </div>
  );
}
