import { defineConfig } from "drizzle-kit";

/**
 * DATABASE_URL set   → Postgres / Supabase.
 * DATABASE_URL unset → local embedded PGlite (same SQL, zero install).
 */
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig(
  databaseUrl
    ? {
        dialect: "postgresql",
        schema: "./src/server/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: databaseUrl },
        strict: true,
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/server/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? ".data/pglite" },
        strict: true,
      },
);
