import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let real: Db | null = null;

function getDb(): Db {
  if (real) return real;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database (a Supabase connection string works directly).",
    );
  }

  // `prepare: false` is required when connecting through Supabase's (or any
  // PgBouncer-style) transaction-mode pooler, which doesn't support
  // session-level prepared statements. Harmless on a direct connection too,
  // so it's left on unconditionally rather than branching on the host.
  const queryClient = postgres(connectionString, { max: 5, prepare: false });
  real = drizzle(queryClient, { schema });
  return real;
}

/**
 * Lazily initialized so importing this module (which every route does,
 * directly or transitively) never throws during `next build`'s page-data
 * collection, when DATABASE_URL legitimately isn't set yet — only an
 * actual query attempt should fail, with a message that says what's
 * missing. Same lazy pattern as lib/anthropic.ts.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
