import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const rows = await db.select().from(clients).orderBy(desc(clients.createdAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Clients</h1>
        <Link
          href="/clients/new"
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          + New client
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No clients yet. Add one to configure their brand guidelines and posting schedule.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clients/${c.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-sm text-slate-500">
                    {c.industry || "No industry set"} · {c.timezone}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {c.active ? "Active" : "Inactive"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
