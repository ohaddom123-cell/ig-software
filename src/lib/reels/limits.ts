// Shared with src/app/api/reels/upload-url/route.ts (direct upload) and
// processReel.ts's URL-import path, so both ways of supplying raw footage
// enforce the same real ceiling instead of drifting apart. See
// upload-url/route.ts for why 50, not some larger number: it's this
// Supabase project's actual plan-wide file size limit, confirmed directly
// against its API, not a code choice.
export const MAX_RAW_FOOTAGE_MB = 50;
