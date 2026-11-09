import { beforeEach } from "vitest";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. The DB-backed tests need a real (throwaway) Postgres database — " +
      "e.g. `DATABASE_URL=postgres://postgres:postgres@localhost:5432/igsoftware_test npm test` " +
      "after running `npm run db:migrate` against it once. See README.md.",
  );
}

// Keep the generation call out of CI/local test runs by default — tests
// that genuinely exercise generateWeeklyCalendar() mock @/lib/anthropic
// themselves instead of hitting the real API.
process.env.ANTHROPIC_API_KEY ??= "test-placeholder-not-a-real-key";

beforeEach(async () => {
  const { db } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");
  // TRUNCATE ... CASCADE keeps this fast and avoids having to hand-order
  // deletes across every foreign key.
  await db.execute(sql`
    TRUNCATE TABLE
      reminder_deliveries,
      content_items,
      weekly_briefs,
      historical_posts,
      posting_schedules,
      time_tracking_entries,
      clients
    RESTART IDENTITY CASCADE
  `);
});
