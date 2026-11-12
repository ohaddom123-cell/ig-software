"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ReelItem {
  id: string;
  clientId: string;
  rawFootageUrl: string;
  status: "uploaded" | "processing" | "ready_for_review" | "approved" | "rejected" | "failed";
  errorMessage: string;
  renderedVideoUrl: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-slate-200 text-slate-600",
  processing: "bg-amber-100 text-amber-800",
  ready_for_review: "bg-blue-100 text-blue-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Queued",
  processing: "Processing…",
  ready_for_review: "Ready for review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
};

export function ReelsPanel({ clients }: { clients: { id: string; name: string }[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [rawFootageUrl, setRawFootageUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ReelItem[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/reels");
    if (res.ok) setItems(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Light polling only while something is actually in flight — no point
  // hammering the API once everything has settled into a final state.
  const hasInFlight = items.some((i) => i.status === "uploaded" || i.status === "processing");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (hasInFlight) {
      intervalRef.current = setInterval(load, 4000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [hasInFlight, load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, rawFootageUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to queue reel");
        return;
      }
      setRawFootageUrl("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function act(id: string, action: "approve" | "reject" | "reprocess") {
    const res = await fetch(`/api/reels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) await load();
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[320px] flex-1">
          <label className="block text-xs font-medium text-slate-600">Raw footage URL</label>
          <input
            required
            type="url"
            value={rawFootageUrl}
            onChange={(e) => setRawFootageUrl(e.target.value)}
            placeholder="https://drive.google.com/... or any public video link"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !clientId}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {submitting ? "Queuing…" : "Process reel"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>

      <ul className="mt-6 space-y-3">
        {items.map((item) => {
          const client = clients.find((c) => c.id === item.clientId);
          return (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-900">
                  {client?.name ?? "Unknown client"} · {new Date(item.createdAt).toLocaleString()}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.status]}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>

              {item.status === "failed" && (
                <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {item.errorMessage}
                </div>
              )}

              {item.renderedVideoUrl && (item.status === "ready_for_review" || item.status === "approved") && (
                <video
                  src={item.renderedVideoUrl}
                  controls
                  className="mt-3 max-h-[480px] rounded-md border border-slate-200"
                />
              )}

              <div className="mt-3 flex gap-2">
                {item.status === "ready_for_review" && (
                  <>
                    <button
                      onClick={() => act(item.id, "approve")}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(item.id, "reject")}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </>
                )}
                {item.status === "failed" && (
                  <button
                    onClick={() => act(item.id, "reprocess")}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
