"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InferSelectModel } from "drizzle-orm";
import type { contentItems } from "@/db/schema";

type Item = InferSelectModel<typeof contentItems> & {
  clientName: string;
  clientTimezone: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  posted: "bg-slate-200 text-slate-600",
};

function shiftWeek(weekStart: string, days: number): string {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ApprovalReview({
  items,
  clients,
  weekStart,
  selectedClientId,
}: {
  items: Item[];
  clients: { id: string; name: string }[];
  weekStart: string;
  selectedClientId: string;
}) {
  const router = useRouter();

  function setWeek(newWeek: string) {
    const params = new URLSearchParams();
    params.set("week", newWeek);
    if (selectedClientId) params.set("clientId", selectedClientId);
    router.push(`/approve?${params.toString()}`);
  }

  function setClient(clientId: string) {
    const params = new URLSearchParams();
    params.set("week", weekStart);
    if (clientId) params.set("clientId", clientId);
    router.push(`/approve?${params.toString()}`);
  }

  const counts = items.reduce(
    (acc, i) => {
      acc[i.approvalStatus] = (acc[i.approvalStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setWeek(shiftWeek(weekStart, -7))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          ← Prev week
        </button>
        <span className="text-sm font-medium text-slate-700">{weekStart}</span>
        <button
          onClick={() => setWeek(shiftWeek(weekStart, 7))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          Next week →
        </button>

        <select
          value={selectedClientId}
          onChange={(e) => setClient(e.target.value)}
          className="ml-auto rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-3 text-xs text-slate-500">
        <span>{items.length} total</span>
        <span>{counts.draft ?? 0} awaiting review</span>
        <span>{counts.approved ?? 0} approved</span>
        <span>{counts.rejected ?? 0} rejected</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          Nothing scheduled this week yet. Submit a weekly brief to generate a calendar.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: Item }) {
  const router = useRouter();
  const [caption, setCaption] = useState(item.currentCaption);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: item.clientTimezone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(item.scheduledAt));

  async function act(action: "approve" | "reject" | "edit") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/content-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "edit" ? { action, currentCaption: caption } : { action }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action failed");
      return;
    }
    if (action === "edit") setEditing(false);
    router.refresh();
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-900">
          {item.clientName} · {item.platform} · {localTime}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.approvalStatus]}`}>
          {item.approvalStatus}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600 italic">{item.contentConcept}</p>

      {item.needsClarification && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
          <strong>Needs clarification:</strong> {item.clarificationNote}
        </div>
      )}

      {editing ? (
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-md border border-slate-300 p-2 text-sm"
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{item.currentCaption}</p>
      )}

      {item.version > 1 && (
        <p className="mt-1 text-xs text-slate-400">Edited (v{item.version})</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              onClick={() => act("edit")}
              disabled={busy}
              className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
            >
              Save edit
            </button>
            <button
              onClick={() => {
                setCaption(item.currentCaption);
                setEditing(false);
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
          >
            Edit
          </button>
        )}
        <button
          onClick={() => act("approve")}
          disabled={busy || item.approvalStatus === "approved"}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => act("reject")}
          disabled={busy || item.approvalStatus === "rejected"}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
