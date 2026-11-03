import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getEnv } from "@/config/env";
import * as schema from "./schema";

/**
 * Single database handle for the process.
 * - DATABASE_URL set   → postgres-js (Supabase or any Postgres). Run `npm run db:migrate`.
 * - DATABASE_URL unset → embedded PGlite under PGLITE_DATA_DIR, migrated automatically.
 */

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

// Runtime paths, not bundle inputs: excluded from Turbopack file tracing.
const MIGRATIONS_FOLDER = path.join(/*turbopackIgnore: true*/ process.cwd(), "drizzle");

// Survives Next.js dev hot reloads, which would otherwise open several PGlite instances on one directory.
const globalForDb = globalThis as unknown as { __ezShopDb?: Promise<Database> };

async function createPostgres(url: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const client = postgres(url, { max: 5, prepare: false });
  return drizzle(client, { schema }) as unknown as Database;
}

/**
 * The embedded database could not be opened, most often because its files were damaged when the
 * computer or the server stopped in the middle of a write. Nothing is erased: the folder stays as it
 * is, to be repaired or replaced by its owner.
 */
export class LocalDatabaseError extends Error {
  override readonly name = "LocalDatabaseError";
  constructor(
    readonly dataDir: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`The local database in ${dataDir} could not be opened.`, options);
  }
}

async function createPglite(dataDir: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const absoluteDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dataDir);
  // Owner only where the system honours it (not Windows): the analyses and the cache stay private.
  mkdirSync(absoluteDir, { recursive: true, mode: 0o700 });
  const client = new PGlite(absoluteDir);
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    return db as unknown as Database;
  } catch (error: unknown) {
    // A failed instance left open would hold the folder: the next try would open it twice.
    await client.close().catch(() => undefined);
    throw new LocalDatabaseError(dataDir, { cause: error });
  }
}

export function getDb(): Promise<Database> {
  if (!globalForDb.__ezShopDb) {
    const env = getEnv();
    const pending = env.DATABASE_URL ? createPostgres(env.DATABASE_URL) : createPglite(env.PGLITE_DATA_DIR);
    // Do not cache a failed initialization: the next call retries.
    globalForDb.__ezShopDb = pending.catch((error: unknown) => {
      globalForDb.__ezShopDb = undefined;
      throw error;
    });
  }
  return globalForDb.__ezShopDb;
}

export { schema };
