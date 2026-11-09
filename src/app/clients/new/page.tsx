"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewClientPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create client");
        return;
      }
      router.push(`/clients/${data.id}`);
    } catch {
      setError("Network error — is the app running and reachable?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-bold text-slate-900">New client</h1>
      <p className="mt-1 text-sm text-slate-500">
        Just the basics to start — brand guidelines, posting schedule, and past content go on
        the client&apos;s own page right after this.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Client name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Example Restaurant"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Time zone</label>
          <input
            required
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="e.g. Asia/Jerusalem, Europe/Madrid"
          />
          <p className="mt-1 text-xs text-slate-400">
            IANA timezone name — this is what keeps posting times correct across DST.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create client"}
        </button>
      </form>
    </div>
  );
}
