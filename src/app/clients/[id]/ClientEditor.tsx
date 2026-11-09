"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InferSelectModel } from "drizzle-orm";
import type { clients, historicalPosts, postingSchedules } from "@/db/schema";

type Client = InferSelectModel<typeof clients>;
type Schedule = InferSelectModel<typeof postingSchedules>;
type HistoricalPost = InferSelectModel<typeof historicalPosts>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const BRAND_FIELDS: { key: keyof Client; label: string; placeholder: string }[] = [
  { key: "tone", label: "Tone of voice", placeholder: "e.g. warm, playful, a bit cheeky" },
  { key: "writingStyle", label: "Writing style", placeholder: "e.g. short punchy sentences, first person" },
  { key: "preferredTerms", label: "Preferred terminology", placeholder: "words/phrases to favor" },
  { key: "prohibitedTerms", label: "Words/phrases to avoid", placeholder: "e.g. \"cheap\", \"guaranteed\"" },
  { key: "contentRestrictions", label: "Content restrictions", placeholder: "topics or claims that are off-limits" },
  { key: "ctaGuidelines", label: "Preferred calls to action", placeholder: "when and how to use a CTA" },
  { key: "productsServices", label: "Products / services", placeholder: "what they actually sell" },
  { key: "additionalNotes", label: "Additional brand notes", placeholder: "anything else the AI should know" },
];

export function ClientEditor({
  client,
  schedules,
  history,
}: {
  client: Client;
  schedules: Schedule[];
  history: HistoricalPost[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{client.name}</h1>
        <p className="text-sm text-slate-500">{client.timezone}</p>
      </div>
      <ClientFieldsForm client={client} />
      <ScheduleSection clientId={client.id} schedules={schedules} />
      <HistorySection clientId={client.id} history={history} />
    </div>
  );
}

function ClientFieldsForm({ client }: { client: Client }) {
  const router = useRouter();
  const [values, setValues] = useState<Client>(client);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof Client>(key: K, value: Client[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to save");
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Profile & brand guidelines</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" value={values.name} onChange={(v) => set("name", v)} />
        <TextField label="Time zone" value={values.timezone} onChange={(v) => set("timezone", v)} />
        <TextField
          label="Industry"
          value={values.industry ?? ""}
          onChange={(v) => set("industry", v)}
        />
        <TextField
          label="Target audience"
          value={values.audience ?? ""}
          onChange={(v) => set("audience", v)}
        />
        <div className="sm:col-span-2">
          <TextArea
            label="Business description"
            value={values.description ?? ""}
            onChange={(v) => set("description", v)}
          />
        </div>
        {BRAND_FIELDS.map((f) => (
          <div key={f.key} className="sm:col-span-2">
            <TextArea
              label={f.label}
              value={(values[f.key] as string) ?? ""}
              onChange={(v) => set(f.key, v as never)}
              placeholder={f.placeholder}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          Active (inactive clients are hidden from weekly-brief/generation pickers)
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt && <span className="text-sm text-emerald-600">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}

function ScheduleSection({ clientId, schedules }: { clientId: string; schedules: Schedule[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState("instagram");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function addRule() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, weekday, postingTime: time }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add schedule rule");
      return;
    }
    router.refresh();
  }

  async function toggleActive(ruleId: string, active: boolean) {
    await fetch(`/api/clients/${clientId}/schedule/${ruleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    router.refresh();
  }

  async function removeRule(ruleId: string) {
    await fetch(`/api/clients/${clientId}/schedule/${ruleId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Posting schedule</h2>
      <p className="mt-1 text-sm text-slate-500">
        Each rule below is one slot per week. The number of posts generated for a week always
        matches the number of active rules here — nothing is invented.
      </p>

      {schedules.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <span className={s.active ? "text-slate-900" : "text-slate-400 line-through"}>
                {s.platform} — {WEEKDAYS[s.weekday]} at {s.postingTime}
              </span>
              <span className="flex gap-3">
                <button
                  onClick={() => toggleActive(s.id, !s.active)}
                  className="text-xs font-medium text-teal-700 hover:underline"
                >
                  {s.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => removeRule(s.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600">Platform</label>
          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="mt-1 w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Day</label>
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={addRule}
          disabled={submitting}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          + Add slot
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

function HistorySection({
  clientId,
  history,
}: {
  clientId: string;
  history: HistoricalPost[];
}) {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function importCsv() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    const res = await fetch(`/api/clients/${clientId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    setResult(`Imported ${data.imported} post(s).`);
    setCsv("");
    router.refresh();
  }

  async function remove(postId: string) {
    await fetch(`/api/clients/${clientId}/history/${postId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Past content library</h2>
      <p className="mt-1 text-sm text-slate-500">
        Real past captions, used as a style reference only — never as a source of current
        prices, promotions, or facts.
      </p>

      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-600">
          Paste CSV (columns: platform, caption, published_at, category, notes — header row
          required, only &quot;caption&quot; is mandatory)
        </label>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
          placeholder={"platform,caption,published_at,category,notes\ninstagram,\"Our new winter menu is here! 🍂\",2025-11-02,seasonal,"}
        />
        <button
          onClick={importCsv}
          disabled={submitting || csv.trim() === ""}
          className="mt-2 rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {submitting ? "Importing…" : "Import"}
        </button>
        {result && <p className="mt-2 text-sm text-emerald-600">{result}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {history.length > 0 && (
        <ul className="mt-5 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {history.map((h) => (
            <li key={h.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div>
                <p className="text-slate-900">{h.caption}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {h.platform}
                  {h.publishedAt ? ` · ${h.publishedAt}` : ""}
                  {h.category ? ` · ${h.category}` : ""}
                </p>
              </div>
              <button
                onClick={() => remove(h.id)}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );
}
