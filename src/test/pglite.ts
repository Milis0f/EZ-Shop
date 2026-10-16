import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Database } from "@/server/db/client";
import * as schema from "@/server/db/schema";

/**
 * Test-only database: in-memory PGlite migrated with the real `drizzle/` migrations.
 * Mirrors `createPglite` in `src/server/db/client.ts`, without a data directory,
 * so tests never open `.data/pglite`.
 */

export interface TestDatabase {
  readonly db: Database;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db: db as unknown as Database, close: () => client.close() };
}

/** Empties every table; the cascade follows the foreign keys of the analysis tables. */
export async function truncateAll(db: Database): Promise<void> {
  await db.execute(sql`TRUNCATE analyses, products, data_providers, provider_cache CASCADE`);
}
