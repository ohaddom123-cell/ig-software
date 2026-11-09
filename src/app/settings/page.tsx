function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
        }`}
      >
        {ok ? "Configured" : "Not configured"}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const remindersLive = process.env.REMINDERS_LIVE === "true";
  const notificationProvider = process.env.NOTIFICATION_PROVIDER ?? "dryrun";

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everything here is configured via environment variables, not in this UI — this page
        just shows what&apos;s wired up so it&apos;s obvious what still needs attention.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Core</h2>
        <StatusRow
          label="Database"
          ok={!!process.env.DATABASE_URL}
          detail="DATABASE_URL — Postgres (a Supabase connection string works directly)"
        />
        <StatusRow
          label="AI generation"
          ok={!!process.env.ANTHROPIC_API_KEY}
          detail="ANTHROPIC_API_KEY — required for weekly calendar generation"
        />
        <StatusRow
          label="App access"
          ok={!!process.env.APP_USERNAME && !!process.env.APP_PASSWORD}
          detail="APP_USERNAME / APP_PASSWORD — protects the whole app"
        />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Reminders</h2>
        <StatusRow
          label="Cron auth"
          ok={!!process.env.CRON_SECRET}
          detail="CRON_SECRET — must match Vercel's cron trigger"
        />
        <StatusRow
          label={`Notification provider: ${notificationProvider}`}
          ok={
            notificationProvider === "dryrun" ||
            (notificationProvider === "email" && !!process.env.RESEND_API_KEY)
          }
          detail={'NOTIFICATION_PROVIDER — "dryrun" logs instead of sending; "email" needs RESEND_API_KEY'}
        />
        <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
          <div>
            <p className="text-sm font-medium text-slate-900">Reminders are live</p>
            <p className="text-xs text-slate-500">
              REMINDERS_LIVE — until this is exactly &quot;true&quot;, every reminder is a dry run
              (logged, never actually sent) regardless of the provider above.
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              remindersLive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
            }`}
          >
            {remindersLive ? "LIVE" : "Dry run"}
          </span>
        </div>
      </section>
    </div>
  );
}
