"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function nextOrCurrentSunday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diff);
  return sunday.toISOString().slice(0, 10);
}

export function BriefForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState(nextOrCurrentSunday());
  const [rawIdeas, setRawIdeas] = useState("");
  const [promotions, setPromotions] = useState("");
  const [events, setEvents] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; briefId: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, weekStart, rawIdeas, promotions, events, additionalInstructions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate calendar");
        return;
      }
      setResult(data);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700">Client</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Week starting</label>
        <input
          type="date"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Ideas for this week</label>
        <textarea
          value={rawIdeas}
          onChange={(e) => setRawIdeas(e.target.value)}
          rows={6}
          placeholder={"- Promote the new winter menu\n- Mention weekend brunch\n- New seasonal dessert"}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Promotions / offers (with real details — prices, dates, terms)</label>
        <textarea
          value={promotions}
          onChange={(e) => setPromotions(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Events / important dates</label>
        <textarea
          value={events}
          onChange={(e) => setEvents(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Additional instructions</label>
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          rows={2}
          placeholder="Tone notes, what to avoid, anything else"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={submitting || !clientId}
        className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {submitting ? "Generating…" : "Generate calendar"}
      </button>

      {result && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          {result.message}{" "}
          <a href="/approve" className="font-medium underline">
            Go review it →
          </a>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
