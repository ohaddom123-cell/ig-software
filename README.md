# ig-software — AI Content Work-Plan Generator with Approval-Gated Posting Reminders

A V1 internal tool: turn a social media manager's rough weekly ideas into a draft content
calendar, let her review and approve every post, and remind her when it's time to publish —
**nothing ever posts automatically.** Manual publishing is a hard requirement, not a
temporary gap.

## What's actually built, honestly

Per the spec this was built from, every feature below is marked by what's actually true —
not what was attempted.

| Area | Status |
|---|---|
| Client profiles, brand guidelines, posting schedules | **Implemented & tested** |
| Historical content import (CSV + single entry) | **Implemented & tested** |
| Weekly brief intake | **Implemented & tested** — now automatic by default (see "Automatic weekly planning" below); the manual form still exists for anyone who wants to fold in a specific idea/promotion |
| AI calendar generation (Claude, structured output, zod-validated) | **Implemented**; generation calls themselves are **not covered by automated tests against the real API** (tests mock the Anthropic boundary — see Testing). Needs `ANTHROPIC_API_KEY` to actually run. |
| Approval workflow (approve/reject/edit, edit invalidates approval) | **Implemented & tested** |
| Scheduled reminders (idempotent, retry, timezone/DST-correct) | **Implemented & tested**, including a full live smoke test (see below) |
| Historical replay/validation | **Implemented & tested** (schema-level exclusion from reminders); **no real historical client data has been run through it yet** — see "Awaiting real data" below |
| Time-saving measurement | **Implemented & tested** (CRUD + comparison math); **no real baseline/pilot numbers recorded yet** — it only becomes meaningful once used |
| Dashboard | **Implemented & manually verified** against a live local run |
| Auth (single shared login) | **Implemented & tested** |
| Database | **Implemented & tested** — schema, migrations, and the full workflow were run against a real local Postgres instance, not just designed on paper |
| Email notifications (Resend) | **Implemented, not externally configured** — no `RESEND_API_KEY` exists for this to send through yet; dry-run provider is fully tested instead |
| Deployed to Vercel | **Done** — live at the production URL below, auto-deploys on every push to `main` |
| Reels: silence-cut + Hebrew captions (Remotion) | **Implemented & type-checked against real installed package APIs.** whisper.cpp compiling and the model downloading were verified for real inside an actual Vercel Sandbox (see "Reels" below) — the one link not yet proven end-to-end in this session is a full real-video run through the live site itself; see "Known gaps" |
| Reels: storage (Supabase Storage, private buckets + signed URLs) | **Implemented**, replacing an earlier Vercel Blob attempt that was permanently blocked by a 403 (account/plan permission, confirmed not transient). Needs `SUPABASE_SERVICE_ROLE_KEY` (and the anon-key pair for direct browser uploads) set — see "Environment variables" |
| Reels: direct video upload (not just a URL import) | **Implemented** — browser uploads straight to Supabase Storage via a signed URL; URL import kept as a fallback, now with SSRF protection |
| Reels: processing infrastructure | **Implemented & verified** — runs in a Vercel Sandbox restored from a pre-built snapshot (whisper.cpp compiled, model pre-downloaded), triggered immediately on submission, with a Postgres-based job queue (atomic claiming, stale-job recovery, retry caps) instead of running inside a plain serverless function, which can't compile whisper.cpp at all (confirmed: Vercel's default Sandbox image doesn't ship a C compiler either — installing `build-essential` is part of the one-time snapshot build, documented in `worker/README.md`) |
| Reels: ivrit.ai Hebrew-tuned transcription | **Investigated and implemented as a config option** (`WHISPER_MODEL=ivrit-v2-d4`) — confirmed Apache-2.0 licensed and a direct ggml-format drop-in. Not the default, and the current Sandbox snapshot doesn't have that model file baked in yet (see `worker/README.md`) |
| Metricool (scheduling/publishing, analytics) | **Decided against** — the integration was scoped in real detail (see git history), but the client explicitly does not want posts publishing themselves, so it was deliberately not built rather than left as a gap |
| Automatic weekly planning (`/api/cron/weekly-brief`) | **Implemented & tested** — every active client's plan for next week generates itself on a schedule, no manual brief submission required; approval is still manual by design |

**Live URL:** https://ig-software.vercel.app (Basic Auth — ask for the username/password, set during deployment and not written down here since this file is public in the repo)

### Awaiting real data

Historical validation and time-saving measurement are fully implemented and exercised with
synthetic data in this session, but the spec is explicit that this isn't the same as real
validation. **Nobody has run this against your mom's actual past posts or actual weekly time
spent yet.** Do that (via `/historical-validation` and `/time-tracking`) before trusting any
of this on a live week — the tool supports it, but hasn't done it.

## Architecture

- **Next.js 16 (App Router) + TypeScript**, Tailwind for styling. Chosen because it's the
  same stack as the other projects in this account (`sentinel-landing`, the `portfolio`
  repo) and deploys the same way, on Vercel.
- **Drizzle ORM + Postgres** (`DATABASE_URL`) for the data layer. A Supabase connection
  string works directly — no Supabase-specific code, just a standard Postgres connection.
- **Claude (`@anthropic-ai/sdk`)**, forced tool-use for structured JSON output, validated
  with `zod` before anything touches the database. The model is given pre-computed posting
  slots (see below) rather than asked to do date/cadence math itself — see "Reliability
  decisions."
- **Vercel Cron** (`vercel.json`) hits two endpoints, both authenticated via a `CRON_SECRET`
  bearer token: `/api/cron/reminders` four times daily (07:00/11:00/15:00/19:00 UTC, the max
  cadence Vercel Hobby plans allow per entry) and `/api/cron/weekly-brief` once a week
  (Thursdays 09:00 UTC) to auto-generate next week's content plan — see "Automatic weekly
  planning" below.
- **Notification provider abstraction** (`src/lib/notifications/`) — `dryrun` (logs, never
  sends; the default) and `email` (Resend) implemented; swapping in WhatsApp later means
  implementing the same interface, nothing else changes.
- **Single shared Basic Auth** (`src/proxy.ts`, Next.js 16's renamed middleware convention) —
  this is a one-or-two-person internal tool, not a public product, so a full user/account
  system would be exactly the "unnecessary enterprise permissions" the spec says to avoid.
  Fails closed (503) if credentials aren't configured, rather than silently serving the app
  open to the internet.

### Automatic weekly planning

The `/brief` form used to be the only way to get a content plan — someone had to remember to
open the site every week. `/api/cron/weekly-brief` now generates next week's plan for every
active client on its own schedule, straight from that client's saved profile:

- Runs once a week (Thursdays), computing next week's Sunday as the target week — far enough
  ahead that there's a weekend to review before the first post is due.
- Calls the exact same `submitWeeklyBrief` function the manual form uses, with every brief
  field left blank — not a parallel/duplicate code path to keep in sync.
- Because of that, all of `submitWeeklyBrief`'s existing safety behavior applies for free: a
  client who already has a brief for that week (e.g. someone used the manual form) is a true
  no-op, and nothing ever overwrites an already-approved item.
- A client with no active posting schedule is reported as "skipped," not an error — there's
  nothing to generate until a schedule exists.
- One client's generation failing (e.g. a transient AI API error) is caught and reported per
  client; it never stops the other clients in the same run.
- **Approval is still entirely manual.** This removes the "remember to submit a brief" step,
  not the "review before anything is real" step — that gate was a deliberate requirement, not
  something this automates away.

### Reels (silence-cut, captioned, approval-gated video)

Raw footage in (direct upload or a URL import), captioned Reel out, same "nothing ships
without approval" discipline as everything else — and, unlike earlier in this project, the
heavy processing now runs somewhere that can actually do it.

**Why this needed its own infrastructure, not just more code:** whisper.cpp (the Hebrew
transcription engine) compiles itself from source on first use — confirmed by reading
`@remotion/install-whisper-cpp`'s actual installed source, not assumed. A plain Vercel
serverless function has no C compiler at all, so it would fail immediately, every time. Even
Vercel's own Sandbox's default image doesn't ship one — `build-essential` has to be installed
as part of the one-time setup. Both facts were discovered by actually trying it, not inferred.

**Architecture:**
1. `src/lib/reels/jobQueue.ts` — the job queue lives in the existing `reel_items` table (no
   separate queue service). `claimNextReelJob` claims exactly one queued/abandoned job using
   Postgres `FOR UPDATE SKIP LOCKED`, concurrency-safe by construction; a job claimed too long
   ago (worker crashed) becomes reclaimable again, up to a retry cap.
2. `src/lib/reels/triggerWorker.ts` — on submission (or reprocess), the app creates a Vercel
   Sandbox **from a pre-built snapshot** (whisper.cpp already compiled, the model already
   downloaded — never compiled or downloaded per-job) and starts the worker **detached**,
   returning immediately rather than making the Next.js request wait on a job that can take
   minutes.
3. `worker/run.ts` — runs inside that Sandbox. Claims jobs in a loop until the queue is
   empty, so one Sandbox spin-up drains the whole backlog, not just one job.
4. A daily cron (`/api/cron/process-reels`) exists only as a safety net, for a trigger call
   that itself failed or a worker that crashed without reporting — Vercel Hobby doesn't allow
   a cron more often than daily per entry anyway (hit this exact limit earlier in the
   project), which is fine for a safety net that isn't the primary path.
5. `lib/reels/silenceDetect.ts` — ffmpeg (`ffmpeg-static`, no system install assumed)
   `silencedetect` filter finds quiet stretches.
6. `lib/reels/segments.ts` — pure interval math turns those into segments to actually keep
   (short natural pauses preserved, padding around cuts so words aren't clipped). Fully
   unit-tested, no real media file needed.
7. `lib/reels/transcribe.ts` — `@remotion/install-whisper-cpp`, defaulting to standard
   multilingual Whisper (`"small"`) with `language: "he"`. ivrit.ai's Hebrew-tuned model is
   available as a configuration option (`WHISPER_MODEL=ivrit-v2-d4`) — see "Reels: ivrit.ai"
   above and `worker/README.md`.
8. `lib/reels/remapCaptions.ts` — reprojects the transcript's timestamps (from the raw,
   uncut audio) onto the trimmed timeline so captions stay in sync with the cut footage.
   Pure logic, unit-tested.
9. `remotion/CaptionedReel.tsx` — the actual composition: video `<Sequence>`s per
   keep-segment, TikTok-style word-highlighted captions in the client's brand colors, props
   validated by a zod schema (required for `<Composition>`'s type contract, not just
   decoration).
10. `lib/reels/render.ts` — orchestrates all of the above via `@remotion/bundler` +
    `@remotion/renderer`'s documented `bundle` → `selectComposition` → `renderMedia` flow.
11. `lib/reels/processReel.ts` — the DB-aware wrapper: downloads/reads the raw footage, runs
    the pipeline reporting real progress stages as it goes, uploads the result to Supabase
    Storage, and persists every state transition (including a specific failure message) so a
    failure is visible, never silently lost.
12. `/reels` — upload a file directly (or paste a URL), watch real stage-by-stage progress
    (not a fabricated percentage), preview the rendered result via a freshly-generated signed
    URL, approve or reject.
13. `src/lib/storage/` — a small `StorageProvider` interface, implemented against Supabase
    Storage (private buckets, signed URLs for both upload and playback). Swappable later
    without touching call sites.

Every API call against Remotion/whisper-cpp packages here was checked against this project's
**actually-installed** `.d.ts` files before being written — not recalled from training data,
which the `claude-api` skill and Remotion's own docs both warn drifts fast. One real bug was
caught this way before it ever shipped: `@remotion/bundler` transitively imports
`@remotion/studio` (the Remotion Studio UI), which references optional browser-only packages
(`@remotion/whisper-webgpu`) that aren't installed and aren't needed for server-side
rendering — Next's bundler tried to statically resolve them anyway and failed the build.
Fixed via `serverExternalPackages` in `next.config.ts` (the same category of fix other
Node-native libraries like `sharp` or `puppeteer` need in Next.js — tell Next to `require()`
these at runtime instead of bundling them).

### Reliability decisions worth knowing about

- **Scheduling is deterministic, not AI-generated.** `lib/scheduling/computeSlots.ts`
  computes the exact UTC datetime for every posting slot from the client's schedule rules
  and timezone (DST-correct — tested explicitly across a real transition). The AI is given
  that fixed list of slots and asked only to fill in content for each one, referenced by
  index. This is what guarantees "number of posts == posting cadence" instead of hoping the
  model counts correctly.
- **The approval gate is enforced in the data layer, not the UI.** `lib/approval.ts` and
  `lib/reminders/processDueReminders.ts` both hard-code `approvalStatus = 'approved'` as a
  real `WHERE` clause. There is no code path — cron included — that can notify about
  draft/rejected content.
- **Idempotency is a database constraint, not application discipline.**
  `reminder_deliveries` has a unique index on `(content_item_id, approved_version)`; the
  cron job uses `ON CONFLICT DO NOTHING` and checks the result, so even two cron runs firing
  concurrently can't double-send. `weekly_briefs` has a unique index on `(client_id,
  week_start)` for the same reason on the generation side.
- **Historical replay items are structurally excluded from reminders.** Every row generated
  in replay mode is tagged `is_historical_replay = true`, and the reminder cron's query
  filters that out directly — not a UI checkbox someone could forget to check.
- **Editing an approved caption reverts it to draft, atomically, in one function**
  (`editContentItemCaption`) — there's exactly one code path that can change `currentCaption`
  after approval, and it always invalidates the approval in the same operation.

## Testing

73 tests, **all passing against a real local Postgres database** (not mocks) — the only
mocked boundary is the Anthropic API call itself, in the three tests that exercise full
brief submission. Run them yourself:

```bash
# one-time: point a throwaway Postgres database at the schema
DATABASE_URL="postgres://postgres:postgres@localhost:5432/igsoftware_test" npm run db:migrate

# run the suite
DATABASE_URL="postgres://postgres:postgres@localhost:5432/igsoftware_test" npm test
```

Coverage, by file:
- `scheduling.test.ts` — slot/weekday math, including a real DST transition (America/New_York, Nov 2026)
- `generation-schema.test.ts` — AI output validation (missing fields, length limits, wrong types all rejected)
- `approval-gate.test.ts` — **the spec's own top priority**: draft/rejected items never produce a reminder, approved+due items do, not-yet-due approved items don't
- `reminder-idempotency.test.ts` — a sent reminder is never resent; an edit-then-reapprove produces a distinct new reminder, not a stale resend; the DB constraint itself rejects a duplicate insert
- `approval-transitions.test.ts` — edit reverts approved→draft, re-approval snapshots the new version
- `client-isolation.test.ts` — one client's data never appears in another's queries; the brief-uniqueness constraint is per-client, not global
- `historical-replay.test.ts` — an approved, due, replay-tagged item still never fires a reminder
- `brief-idempotency.test.ts` — identical resubmission is a true no-op; an edited resubmission regenerates drafts but never touches an approved item
- `reels-segments.test.ts` (15 tests) — silence-to-keep-segment math: padding, merging, short-pause preservation, leading/trailing silence, timeline remapping
- `reels-remap-captions.test.ts` (5 tests) — caption timestamps shift correctly across a cut; captions fully inside a removed silence are dropped
- `reels-silence-parse.test.ts` (4 tests) — ffmpeg's `silencedetect` stderr format parsed correctly, including a realistic multi-line transcript and a dangling unclosed silence
- `weekly-brief-auto.test.ts` (5 tests) — next week's Sunday is computed correctly from any day of the week; active clients with a schedule generate, inactive clients are skipped entirely, clients with no schedule are reported "skipped" not "failed", running twice never duplicates items
- `weekly-brief-auto-failure.test.ts` (1 test) — one client's generation failing is reported as `status: "failed"` and does not stop the rest of the run from completing
- `reel-job-queue.test.ts` (8 tests) — the concurrency-critical ones: two concurrent claims never return the same job; a fresh claim isn't reclaimed; a claim that's gone stale (worker crash) is recovered, with retry count incremented; a job is no longer reclaimed once it's exhausted its retries; progress/failure reporting persists correctly
- `reel-validate-footage-url.test.ts` (7 tests) — the SSRF guard rejects loopback/private/link-local/cloud-metadata addresses and the literal hostname `localhost`, and accepts a normal public address

One real bug was found and fixed while writing these: vitest's default parallel-file
execution let two test files' `TRUNCATE` calls race against the same shared test database.
Fixed with `fileParallelism: false` in `vitest.config.ts`.

`npx tsc --noEmit` and `npm run build` both pass cleanly. `npm run lint` crashes
(`TypeError: Converting circular structure to JSON` inside `@eslint/eslintrc`'s config
validator) — confirmed **pre-existing**, not something this session's changes caused: it
reproduces identically with `git stash` applied against an unmodified `main`. Likely an
ESLint 9 / `eslint-config-next` version-compatibility issue; worth a dedicated fix, but out
of scope for the Reels work this session was about.

**Not unit-tested, by explicit, documented choice, same as before:** `transcribe.ts` (shells
out to a real compiled binary and downloads a real multi-hundred-MB model — see its own
comment), and the worker's Sandbox-orchestration code (`triggerWorker.ts`), which needs a
real Vercel Sandbox to mean anything. What *is* verified about these: whisper.cpp compiling
and the model downloading were confirmed for real inside an actual Vercel Sandbox this
session (not assumed from documentation), and the resulting snapshot was confirmed to restore
correctly with both intact — see "Known gaps" for exactly what's still unverified beyond that.

**Beyond the automated suite**, the full live workflow was manually smoke-tested against a
real running instance (`npm start`) and a real local Postgres: created a client via the API,
added a posting schedule, inserted a due content item, approved it via the API, confirmed
the cron endpoint found it, sent exactly one dry-run reminder (log output included real
client name/platform/time/caption), confirmed a second cron run correctly skipped it as
already-sent, confirmed the dashboard's counts matched, and confirmed the cron endpoint
correctly 401s with a wrong secret. Every page (`/`, `/clients`, `/clients/[id]`, `/brief`,
`/approve`, `/calendar`, `/historical-validation`, `/settings`, `/time-tracking`) returned
200 under Basic Auth and 401 without it.

## Environment variables

See `.env.example` for the full list with descriptions. Summary of what's required for what:

| To do this | You need |
|---|---|
| Run the app at all | `DATABASE_URL`, `APP_USERNAME`, `APP_PASSWORD` |
| Generate content | + `ANTHROPIC_API_KEY` |
| Send real reminders | + `CRON_SECRET`, `NOTIFICATION_PROVIDER=email`, `RESEND_API_KEY`, `REMINDER_FROM_EMAIL`, `REMINDER_TO_EMAIL`, **and** `REMINDERS_LIVE=true` |
| Process reels | + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `REEL_WORKER_SNAPSHOT_ID` (all currently unset — see Known gaps and "External setup required" in the handover report) |

`REMINDERS_LIVE` is a deliberate kill switch: until it's exactly `"true"`, every reminder is
a dry run (logged, never sent) no matter what `NOTIFICATION_PROVIDER` is set to. The
`/settings` page shows which of these are currently configured, without exposing their
values.

## Running locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
npm run db:generate          # only needed if you change schema.ts
npm run db:migrate           # creates the tables
npm run dev
```

## Deploying

**Already done.** The project is live at https://ig-software.vercel.app, linked to this
GitHub repo (`ohaddom123-cell/ig-software`) so every push to `main` auto-deploys — no manual
redeploy step needed going forward.

Currently set in Vercel: `APP_USERNAME`, `APP_PASSWORD`, `CRON_SECRET` (all generated,
not reused from anywhere), `REMINDERS_LIVE=false`, `NOTIFICATION_PROVIDER=dryrun`.
Vercel's SSO/Auth protection was disabled on the project so the app's own Basic Auth is
what actually gates it — without that, Vercel's own login wall would sit in front of it too.

**Still missing, and only you can supply these — they're your own account credentials, not
something that can be generated:**
- `DATABASE_URL` — point this at a real Postgres (Supabase works directly). Until it's set,
  every page fails closed with a clear "not configured" message rather than crashing.
- `ANTHROPIC_API_KEY` — needed for the content generator to actually run.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings →
  API → Project URL / "service_role" secret. Needed for reels to store raw footage and
  output video at all. After setting these, run `npm run storage:setup` once to create the
  `reel-raw`/`reel-output` buckets.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same dashboard page, the
  "anon" public key. These are intentionally public; the browser uses them only to complete
  a direct upload to a URL the server already signed.
- `REEL_WORKER_SNAPSHOT_ID` — the Vercel Sandbox snapshot with whisper.cpp and the Whisper
  model pre-built. This session created `snap_sH0NdfrcJ9v2ERvbXMg5pg0ZFhVI` and already set
  it on the Vercel project (all environments) — but it **expires 7 days after creation**
  (2026-11-24). Rebuild it by then following `worker/README.md`, or reel submission starts
  failing with a snapshot-not-found error.

`vercel.json` defines four daily cron checks (07:00/11:00/15:00/19:00 UTC — Vercel Hobby
only allows up to once/day per cron *entry*, so this uses four separate entries instead of
one frequent one; the first deploy attempt actually failed on this before the fix landed).
Leave `REMINDERS_LIVE=false` until you've run `/historical-validation` against real past
weeks and are satisfied with the output.

## Using it

1. **Add a client**: `/clients/new`, then on the client's own page fill in brand guidelines
   and add posting schedule rules (platform, weekday, time) — the number of posts generated
   each week always matches the number of active rules here.
2. **Import past content** (optional but recommended): same client page, paste CSV
   (`platform,caption,published_at,category,notes` — only `caption` is required) or add
   posts one at a time. Used as a style reference only, never as a source of current facts.
3. **Weekly plans now generate themselves** — nothing to do here by default. `/brief` still
   exists if you want to fold a specific idea, promotion, or event into a given week.
4. **Review and approve**: `/approve` — edit inline if needed (this resets approval), then
   approve or reject each item. Nothing downstream happens until you approve.
5. **Check the calendar**: `/calendar` for a read-only chronological view.
6. **Test reminders without risk**: with `REMINDERS_LIVE` unset/false, approve something
   with a near-past `scheduledAt` (or just wait for a real slot to arrive) and manually hit
   `/api/cron/reminders` with the right bearer token, or wait for Vercel Cron — you'll see
   the dry-run output in your logs instead of a real send.
7. **Run historical validation before going live**: `/historical-validation` — pick a client
   and a real past week, reconstruct that week's brief, generate a retrospective calendar,
   and compare it side-by-side against what was actually posted. This can never trigger a
   real reminder, by construction.
8. **Record time**: `/time-tracking` — log a baseline week before using the tool, then pilot
   weeks after. The comparison is what actually proves (or disproves) time saved — the tool
   doesn't assume it.
9. **Process a reel**: `/reels` — pick a client, then either upload a video file directly
   (goes straight to Supabase Storage via a signed URL, bypassing Next.js's request body
   limit) or paste a public link to raw footage, then submit. Processing starts immediately
   in the background (a Vercel Sandbox worker), not inside the request — the panel polls and
   shows real stage-by-stage status (downloading → transcribing → editing → rendering →
   uploading), never a fabricated percentage. Once "ready for review," preview (via a
   freshly-signed, time-limited URL) and approve/reject. See "Known gaps" below before
   relying on this for a real deadline.

## Known gaps — read before relying on Reels for anything live

The architecture problems from the first version (processing inside a Next.js request, Vercel
Blob, no real job queue) are fixed — see "Reels" above for what's actually in place now
(Supabase Storage, a Postgres-backed job queue, a Vercel Sandbox worker). What's left is
narrower:

- **Supabase Storage isn't provisioned yet.** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are still unset (these are
  account credentials only the project owner can supply — see "Environment variables" and
  "Deploying"). Until they're set and `npm run storage:setup` has been run once to create the
  `reel-raw` and `reel-output` buckets, both the upload-URL endpoint and the worker's
  storage reads/writes fail immediately with a clear error — nothing silently hangs.
- **The Sandbox snapshot expires 7 days after creation.** This session built
  `snap_sH0NdfrcJ9v2ERvbXMg5pg0ZFhVI` (whisper.cpp compiled, the "small" Whisper model
  pre-downloaded) and set it as `REEL_WORKER_SNAPSHOT_ID`, but a Vercel Sandbox snapshot has
  a fixed 7-day lifetime with no way to extend it (confirmed, not assumed). Rebuild it before
  then — see `worker/README.md` for the exact steps — or `triggerReelWorker()` starts failing
  with a snapshot-not-found error on every new job.
- **No full real-video end-to-end run was completed this session.** Every pipeline stage is
  implemented against this project's actually-installed package APIs, and the individual
  pieces were verified for real where it mattered most (whisper.cpp genuinely compiles and
  the model genuinely downloads inside an actual Vercel Sandbox — confirmed by doing it, not
  by reading docs). What wasn't completed was feeding one real video all the way through
  submission → download → transcribe → render → upload → "ready for review" against the live
  site. Do that once, end to end, before trusting this for a real deadline — see "How to
  operate the system" below for exactly how.
- **ivrit.ai's Hebrew-tuned model isn't in the live snapshot.** The integration is real —
  `WHISPER_MODEL=ivrit-v2-d4` is a working config switch (see `worker/README.md`), the model
  is confirmed Apache-2.0 licensed and a drop-in ggml file — but the snapshot built this
  session only has the standard "small" model downloaded into it. Using ivrit.ai means
  rebuilding the snapshot with that model file included first, or the first job just fails on
  a missing-model error.
- **Uploaded files aren't validated server-side beyond size.** The upload-URL endpoint checks
  file size against `maxFileSizeMb` but doesn't inspect content-type or file signature before
  handing out a signed upload URL — someone could upload a non-video file and it would fail
  later, at the probe/transcribe step, rather than being rejected upfront. Not a security gap
  (the bucket is private, keyed per-client, signed URLs expire), just a worse error message
  than it could be.
- **Authorization is still the same single shared login as the rest of the app.** Anyone who
  can log in can submit, view, or reprocess any client's reels — there's no per-client or
  per-user access boundary within Reels specifically. This was a deliberate, pre-existing
  design choice for this whole small internal tool (see "Using it" / Basic Auth), not
  something this session's Reels work introduced or was asked to change.
