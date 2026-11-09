import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { BriefForm } from "./BriefForm";

export const dynamic = "force-dynamic";

export default async function BriefPage() {
  const activeClients = await db.select().from(clients).where(eq(clients.active, true));

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-slate-900">Weekly brief</h1>
      <p className="mt-1 text-sm text-slate-500">
        Rough bullet points are fine — this doesn&apos;t need to be polished writing.
      </p>

      {activeClients.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No active clients yet. <a className="text-teal-700 underline" href="/clients/new">Add one first</a>.
        </p>
      ) : (
        <BriefForm clients={activeClients.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </div>
  );
}
