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
| Weekly brief intake | **Implemented & tested** |
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
| Reels: silence-cut + Hebrew captions (Remotion) | **Implemented & type-checked against real installed package APIs; NOT run end-to-end against a real video in this session** — see "Reels" below |
| Reels: storage (Vercel Blob upload) | **Implemented, blocked** — provisioning a Blob store failed with a 403 (account/plan permission); see "Known gaps" |
| Reels: actual rendering on Vercel | **Not proven to work within serverless limits** — see "Known gaps" |
| Metricool (scheduling/publishing, analytics) | **Not integrated** — real tool access was available and the integration was scoped in detail, but not built; see "Known gaps" |

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
- **Vercel Cron** (`vercel.json`, four times daily — 07:00/11:00/15:00/19:00 UTC, the max cadence Vercel Hobby plans allow) hits `/api/cron/reminders`, authenticated
  via a `CRON_SECRET` bearer token.
- **Notification provider abstraction** (`src/lib/notifications/`) — `dryrun` (logs, never
  sends; the default) and `email` (Resend) implemented; swapping in WhatsApp later means
  implementing the same interface, nothing else changes.
- **Single shared Basic Auth** (`src/proxy.ts`, Next.js 16's renamed middleware convention) —
  this is a one-or-two-person internal tool, not a public product, so a full user/account
  system would be exactly the "unnecessary enterprise permissions" the spec says to avoid.
  Fails closed (503) if credentials aren't configured, rather than silently serving the app
  open to the internet.

### Reels (silence-cut, captioned, approval-gated video)

Raw footage in (a public URL — Google Drive/Dropbox link, not a file upload system; see
"Known gaps" for why), captioned Reel out, same "nothing ships without approval" discipline
as everything else:

1. `lib/reels/silenceDetect.ts` — ffmpeg (`ffmpeg-static`, no system install assumed)
   `silencedetect` filter finds quiet stretches.
2. `lib/reels/segments.ts` — pure interval math turns those into segments to actually keep
   (short natural pauses preserved, padding around cuts so words aren't clipped). Fully
   unit-tested, no real media file needed.
3. `lib/reels/transcribe.ts` — `@remotion/install-whisper-cpp`, standard multilingual Whisper
   with `language: "he"` (Hebrew is natively supported). **Not** ivrit.ai's Hebrew-tuned
   model — see "Known gaps."
4. `lib/reels/remapCaptions.ts` — reprojects the transcript's timestamps (from the raw,
   uncut audio) onto the trimmed timeline so captions stay in sync with the cut footage.
   Pure logic, unit-tested.
5. `remotion/CaptionedReel.tsx` — the actual composition: video `<Sequence>`s per
   keep-segment, TikTok-style word-highlighted captions in the client's brand colors, props
   validated by a zod schema (required for `<Composition>`'s type contract, not just
   decoration).
6. `lib/reels/render.ts` — orchestrates all of the above via `@remotion/bundler` +
   `@remotion/renderer`'s documented `bundle` → `selectComposition` → `renderMedia` flow.
7. `lib/reels/processReel.ts` — the DB-aware wrapper: downloads the raw footage, runs the
   pipeline, uploads the result to Vercel Blob, and persists every state transition
   (`uploaded → processing → ready_for_review → approved/rejected`, or `failed` with the
   real error message) so a failure is visible, not silently lost.
8. `/reels` — submit a footage URL, watch status update (polling only while something's
   actually in flight), preview the rendered result, approve or reject.

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

52 tests, **all passing against a real local Postgres database** (not mocks) — the only
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

One real bug was found and fixed while writing these: vitest's default parallel-file
execution let two test files' `TRUNCATE` calls race against the same shared test database.
Fixed with `fileParallelism: false` in `vitest.config.ts`.

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
| Process reels | + `BLOB_READ_WRITE_TOKEN` (currently blocked — see Known gaps) |

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
- `BLOB_READ_WRITE_TOKEN` — needed for reels to reach "ready for review" at all; see Known
  gaps below for why this wasn't provisioned automatically.

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
3. **Submit a weekly brief**: `/brief` — rough bullet points are fine. Generates a draft
   calendar.
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
9. **Process a reel**: `/reels` — pick a client, paste a public link to raw footage, submit.
   Status updates as it works through the pipeline; once "ready for review," preview and
   approve/reject. See "Known gaps" below before relying on this for a real deadline.

## Known gaps — read before relying on Reels for anything live

Built and type-checked against real APIs, but not all of it has been proven against a real
video in a real deployment yet. Specifically:

- **Blob storage isn't provisioned.** Creating a Vercel Blob store for this project failed
  in this session with a 403 (account/plan permission — not something retrying fixes). Until
  someone with the right access creates one (Vercel dashboard → Storage → Create → Blob,
  connect it to this project) and `BLOB_READ_WRITE_TOKEN` is set, reel processing will reach
  the render step and then fail at the upload step every time — it won't reach
  "ready for review."
- **Actual rendering needs more than a standard serverless function gives it.** Remotion's
  render step launches a real headless Chrome and runs real ffmpeg — genuinely heavy, and
  likely to exceed a standard Vercel function's execution time, especially on Hobby. Remotion
  documents a Vercel-specific rendering path ("Vercel Sandbox," built for exactly this) but
  its exact setup couldn't be verified in this session — the network access needed to read
  `remotion.dev`'s docs was blocked here. What's built instead is the standard Node.js SSR
  render path (`bundle` + `renderMedia`), which is correct and documented, but needs either
  Remotion Lambda, a dedicated long-running worker, or that Vercel Sandbox path (verify it
  first) to actually run reliably in production — not a plain serverless function as-is.
- **Hebrew transcription uses standard Whisper, not ivrit.ai.** Genuinely supports Hebrew
  (`language: "he"` is a real, working option), but ivrit.ai's Hebrew-fine-tuned model would
  be meaningfully more accurate. Swapping it in needs a ggml-format ivrit.ai model file and
  either a small fork of `@remotion/install-whisper-cpp`'s model-path resolution (it's typed
  to the official Whisper model names only) or manually placing the file where whisper.cpp's
  resolution expects it. Documented as a real next step, not silently assumed done.
- **No end-to-end run against a real video.** Every function in the reel pipeline is written
  against this project's actually-installed package APIs (verified by reading the installed
  `.d.ts` files directly, not recalled from training) and the whole thing type-checks and
  builds cleanly — but nobody has fed it a real clip yet. Do that once (via `/reels`, once
  `BLOB_READ_WRITE_TOKEN` is set) before trusting it for something with a real deadline.
- **Metricool was researched, not integrated.** Real MCP tool access to Metricool was
  available in this session and the integration was scoped in detail — generate the content,
  wait for approval, then call `createScheduledPost` (or `createScheduledPostForReview` for
  Metricool's own native approval flow) to actually publish, instead of the current
  reminder-to-post-manually flow. Not built. A clear, well-defined next phase, not a vague
  idea — see the conversation history for the exact tool schemas and the tradeoffs between
  Metricool's native approval system and this app's own.
- **Raw footage input is a public URL, not a file upload.** Simpler, and sidesteps needing
  Blob storage working just to receive a file — but it means whoever submits a reel needs
  somewhere to put the raw footage first (Google Drive/Dropbox share link, etc.).
