import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and point it at a Postgres database (a Supabase connection string works directly).",
  );
}

const queryClient = postgres(connectionString, { max: 5 });

export const db = drizzle(queryClient, { schema });
