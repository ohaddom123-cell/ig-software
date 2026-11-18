# Reel processing worker

`run.ts` is the worker entry point. It runs inside a Vercel Sandbox
restored from a pre-built snapshot (whisper.cpp already compiled, the
Whisper model already downloaded) — never inside a normal Next.js
serverless function, which has no C compiler and can't run a real
headless-Chrome render.

It is triggered automatically (see `src/lib/reels/triggerWorker.ts`) when
a reel is submitted or reprocessed, and by a daily safety-net cron
(`/api/cron/process-reels`) that catches anything the on-submission
trigger missed.

## Rebuilding the snapshot

The snapshot (`REEL_WORKER_SNAPSHOT_ID` env var) **expires 7 days after
creation** (a Vercel Sandbox API default this session couldn't override —
see the handover report). Rebuild it before then, or the moment
`triggerReelWorker()` starts failing with a snapshot-not-found error.

This has to be run from somewhere with Vercel API access (the Vercel MCP
tools, or `vercel` CLI with equivalent Sandbox commands) — it is **not**
part of the Next.js app's own deploy.

1. Create a sandbox (`timeout` around 1,800,000ms — this account's actual
   ceiling turned out to be lower than the documented schema maximum;
   1,800,000 is confirmed to work):
   ```
   Sandbox.create({
     name: "reel-worker-snapshot-build",
     timeout: 1_800_000,
     persistent: false,
   })
   ```
2. Write this directory's contents into the sandbox, plus:
   `src/lib/reels/{segments,remapCaptions,silenceDetect,media,transcribe,render,jobQueue,processReel,validateFootageUrl}.ts`,
   `src/lib/storage/{types,supabaseStorage,index}.ts`,
   `src/db/{schema,client}.ts`, `remotion/*.tsx`, `remotion/index.ts`,
   and a `package.json` with this project's `@remotion/*`, `remotion`,
   `@supabase/supabase-js`, `drizzle-orm`, `postgres`, `ffmpeg-static`,
   `zod`, `tsx` dependencies (see `npm install` step below — no
   `@vercel/sandbox` or Next.js needed in the worker itself).
3. In the sandbox, run, in one command (the sandbox's `timeout` is an
   **absolute wall-clock cap from creation**, not an idle timer — do this
   in as few round-trips as possible):
   ```bash
   npm install \
     && sudo apt-get update -qq && sudo apt-get install -y -qq build-essential libnss3 libnspr4 \
     && npx tsx -e '
         import("@remotion/install-whisper-cpp").then(async (w) => {
           await w.installWhisperCpp({ to: "/vercel/.whisper-cpp", version: "1.5.5" });
           await w.downloadWhisperModel({ model: "small", folder: "/vercel/.whisper-cpp" });
         });
       '
   ```
   `build-essential` is **not** in Vercel's default "universal" sandbox
   image — installing it is a real, necessary step, confirmed by it
   failing with `spawn make ENOENT` without it. `libnss3`/`libnspr4`
   aren't in it either — without them, headless Chrome (which Remotion's
   render step needs) fails to even launch, with "error while loading
   shared libraries: libnspr4.so: cannot open shared object file" — found
   by running a real reel through a real Sandbox worker, not assumed.
4. Verify before snapshotting: `/vercel/.whisper-cpp/main` (the compiled
   binary) and `/vercel/.whisper-cpp/ggml-small.bin` (the model) both
   exist, and that headless Chrome can actually launch:
   `ldd node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell | grep "not found"`
   should print nothing.
5. Snapshot the session (`create_sandboxes_sessions_by_session_id_snapshot_v3`
   or the CLI equivalent) and set the resulting `snap_...` ID as
   `REEL_WORKER_SNAPSHOT_ID` on the Vercel project (all environments).
6. Sanity check: create a *new* sandbox with `source: {type: "snapshot",
   snapshotId: "snap_..."}` and confirm the same two files exist without
   re-running any install step — that's the whole point of the snapshot.

## Using ivrit.ai's Hebrew-tuned model instead

`WHISPER_MODEL=ivrit-v2-d4` (see `.env.example`) switches to
[ivrit-ai/whisper-v2-d4-ggml](https://huggingface.co/ivrit-ai/whisper-v2-d4-ggml)
— confirmed Apache-2.0 licensed, and a direct ggml binary (same format
whisper.cpp already uses), so no conversion or extra tooling is needed.
`src/lib/reels/transcribe.ts` downloads it from Hugging Face directly
(not via `@remotion/install-whisper-cpp`'s `downloadWhisperModel`, which
only knows the official Whisper repo).

If you set `WHISPER_MODEL=ivrit-v2-d4`, the snapshot must have that model
file too, or the first job just fails on a missing-model error instead of
downloading it mid-job (same reasoning as not compiling whisper.cpp
per-job — don't do a ~3GB download inside a production job). Add this to
step 3's command, after the `small` model download:
```bash
npx tsx -e '
  import("node:fs").then(async (fs) => {
    const res = await fetch("https://huggingface.co/ivrit-ai/whisper-v2-d4-ggml/resolve/main/ggml-ivrit-v2-d4.bin");
    const { pipeline } = await import("node:stream/promises");
    const { Readable } = await import("node:stream");
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream("/vercel/.whisper-cpp/ggml-ivrit-v2-d4.bin"));
  });
'
```
This was investigated and found genuinely feasible (license + technical
fit both verified directly, not assumed), but not pre-baked into the
snapshot this session built — that snapshot has only `small`. Switching
is a config change (`WHISPER_MODEL` + rebuilding the snapshot with the
extra file), not new code.

## Why "small", not "medium"

`transcribe.ts`'s own default is `"medium"` (better accuracy), but the
worker explicitly passes `"small"` (see `processReelItem`). `"medium"` is
~1.5GB; Vercel Sandbox disk is generous enough that this isn't a hard
blocker the way it was flagged as a risk for plain serverless functions,
but `"small"` (~500MB) downloads and runs noticeably faster for a
real-time-feeling approval workflow. Override via the `whisperModel`
option if accuracy matters more than speed for a given use case — the
model just needs to be pre-downloaded into the snapshot to avoid
downloading it on every job.
