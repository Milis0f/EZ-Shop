import "server-only";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { getEnv } from "@/config/env";
import { pendingMigrations, writeBackup } from "./backup-files";
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
// `pglite` is the open embedded instance (backups dump it); `paused` holds every opening while a
// restore swaps the folder.
const globalForDb = globalThis as unknown as { __ezShopDb?: Promise<Database>; __ezShopPglite?: PGlite; __ezShopPaused?: Promise<void> };

/** The embedded database folder, absolute. */
export const localDataDir = (): string => path.resolve(/*turbopackIgnore: true*/ process.cwd(), getEnv().PGLITE_DATA_DIR);

/** Where backups go: BACKUP_DIR, else a `backups` folder next to the database folder. */
export function backupDir(): string {
  const env = getEnv();
  return env.BACKUP_DIR ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.BACKUP_DIR) : path.join(path.dirname(localDataDir()), "backups");
}

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
  const existed = existsSync(path.join(absoluteDir, "PG_VERSION"));
  const client = new PGlite(absoluteDir);
  try {
    const db = drizzle(client, { schema });
    if (existed) await backupBeforeMigrating(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    globalForDb.__ezShopPglite = client;
    return db as unknown as Database;
  } catch (error: unknown) {
    // A failed instance left open would hold the folder: the next try would open it twice.
    await client.close().catch(() => undefined);
    throw new LocalDatabaseError(dataDir, { cause: error });
  }
}

/**
 * An update that brings migrations changes the tables: the database as it was is kept first. A failed
 * backup does not stop the start (each migration runs in a transaction); it is reported.
 */
async function backupBeforeMigrating(client: PGlite): Promise<void> {
  try {
    if ((await pendingMigrations(client, path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))) === 0) return;
    const result = await writeBackup(client, backupDir(), "before_migration");
    if (!result.ok) console.error("[db] backup before migrating failed:", result.failure);
    else if (!result.manifest.verified) console.error("[db] backup before migrating could not be reopened:", result.manifest.failure);
  } catch (error: unknown) {
    console.error("[db] backup before migrating failed:", error instanceof Error ? error.message : error);
  }
}

/** The open embedded database, for backups; null with DATABASE_URL (Postgres has its own tools). */
export async function localDatabase(): Promise<PGlite | null> {
  if (getEnv().DATABASE_URL) return null;
  await getDb();
  return globalForDb.__ezShopPglite ?? null;
}

/**
 * Runs `work` with the embedded database closed and every new opening held until it is done: a
 * restore swaps the folder underneath. Requests in the meantime wait, then open the new folder.
 */
export async function whileDatabaseClosed<T>(work: (dataDir: string) => Promise<T>): Promise<T> {
  while (globalForDb.__ezShopPaused) await globalForDb.__ezShopPaused;
  let release = () => {};
  globalForDb.__ezShopPaused = new Promise<void>((resolve) => (release = resolve));
  try {
    const open = globalForDb.__ezShopDb;
    globalForDb.__ezShopDb = undefined;
    await open?.catch(() => undefined);
    await globalForDb.__ezShopPglite?.close().catch(() => undefined);
    globalForDb.__ezShopPglite = undefined;
    return await work(localDataDir());
  } finally {
    globalForDb.__ezShopPaused = undefined;
    release();
  }
}

export function getDb(): Promise<Database> {
  const paused = globalForDb.__ezShopPaused;
  if (paused) return paused.then(() => getDb());
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
