import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { ReelsPanel } from "./ReelsPanel";

export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const activeClients = await db.select().from(clients).where(eq(clients.active, true));

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Reels</h1>
      <p className="mt-1 text-sm text-slate-500">
        Upload raw footage (a public link — e.g. Google Drive, Dropbox), the system cuts
        silences, adds branded captions, and renders a preview for you to approve before it
        ever gets posted.
      </p>

      {activeClients.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No active clients yet. <a className="text-teal-700 underline" href="/clients/new">Add one first</a>.
        </p>
      ) : (
        <ReelsPanel clients={activeClients.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </div>
  );
}
