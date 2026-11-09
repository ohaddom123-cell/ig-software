"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TimeTrackingForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState("");
  const [kind, setKind] = useState<"baseline" | "pilot">("baseline");
  const [planningMinutes, setPlanningMinutes] = useState(0);
  const [writingMinutes, setWritingMinutes] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/time-tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, weekStart, kind, planningMinutes, writingMinutes, notes }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      return;
    }
    setWeekStart("");
    setPlanningMinutes(0);
    setWritingMinutes(0);
    setNotes("");
    router.refresh();
  }

  if (clients.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Record a week</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          required
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "baseline" | "pilot")}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="baseline">Baseline (before)</option>
          <option value="pilot">Pilot (during)</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Planning (min)
          <input
            type="number"
            min={0}
            value={planningMinutes}
            onChange={(e) => setPlanningMinutes(Number(e.target.value))}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Writing (min)
          <input
            type="number"
            min={0}
            value={writingMinutes}
            onChange={(e) => setWritingMinutes(Number(e.target.value))}
            className="w-20 rounded-md border border-slate-300 px-2 py-1"
          />
        </label>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="mt-3 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !weekStart}
        className="mt-3 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save entry"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
