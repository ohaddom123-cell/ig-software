"use client";

import { useState } from "react";

interface GeneratedItem {
  id: string;
  platform: string;
  scheduledAt: string;
  contentConcept: string;
  currentCaption: string;
  needsClarification: boolean;
  clarificationNote: string;
}

const EVAL_DIMENSIONS = [
  "Brand voice similarity",
  "Relevance to the original ideas",
  "Content variety (not repetitive)",
  "Caption quality",
  "Factual accuracy",
  "Relevance to the scheduled posting slot",
  "How much editing would realistically be required",
];

export function HistoricalValidationForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [weekStart, setWeekStart] = useState("");
  const [rawIdeas, setRawIdeas] = useState("");
  const [promotions, setPromotions] = useState("");
  const [events, setEvents] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [actualPosts, setActualPosts] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GeneratedItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setItems(null);
    try {
      const res = await fetch("/api/historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, weekStart, rawIdeas, promotions, events, additionalInstructions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Replay generation failed");
        return;
      }
      setMessage(data.message);

      const fetchRes = await fetch(
        `/api/historical?clientId=${clientId}&weekStart=${weekStart}`,
      );
      const fetched = await fetchRes.json();
      setItems(fetched.items ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className="block text-sm font-medium text-slate-700">
              That week&apos;s start date (a real past week)
            </label>
            <input
              type="date"
              required
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Reconstructed ideas for that week (what you were actually trying to communicate)
          </label>
          <textarea
            value={rawIdeas}
            onChange={(e) => setRawIdeas(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <textarea
            value={promotions}
            onChange={(e) => setPromotions(e.target.value)}
            placeholder="Promotions that were actually live that week"
            rows={2}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={events}
            onChange={(e) => setEvents(e.target.value)}
            placeholder="Events / dates that week"
            rows={2}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <textarea
          value={additionalInstructions}
          onChange={(e) => setAdditionalInstructions(e.target.value)}
          placeholder="Additional instructions"
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          disabled={submitting || !weekStart}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {submitting ? "Generating retrospective…" : "Generate retrospective calendar"}
        </button>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {items && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h2 className="font-semibold text-slate-900">Generated (retrospective)</h2>
            <ul className="mt-2 space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                  <p className="text-xs text-slate-400">
                    {item.platform} · {new Date(item.scheduledAt).toLocaleString()}
                  </p>
                  <p className="mt-1 italic text-slate-500">{item.contentConcept}</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800">{item.currentCaption}</p>
                  {item.needsClarification && (
                    <p className="mt-1 text-xs text-amber-700">⚠ {item.clarificationNote}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">What you actually posted</h2>
            <p className="mt-1 text-xs text-slate-500">
              Paste the real captions from that week here for side-by-side comparison — not
              saved, just for your own review.
            </p>
            <textarea
              value={actualPosts}
              onChange={(e) => setActualPosts(e.target.value)}
              rows={12}
              className="mt-2 w-full rounded-md border border-slate-300 p-2 text-sm"
              placeholder="Paste each actual caption, one per line or separated by blank lines"
            />
          </div>
        </div>
      )}

      {items && (
        <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Your judgment call</h3>
          <p className="mt-1 text-xs text-slate-500">
            No automated score here on purpose — a similarity score isn&apos;t the same thing as
            your judgment. Walk through each of these for yourself before trusting this on a
            live week:
          </p>
          <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
            {EVAL_DIMENSIONS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
