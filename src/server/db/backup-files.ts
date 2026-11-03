import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile, rename, rm, statfs, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { z } from "zod";

/**
 * Backups of the embedded database, with PGlite's own supported tools only: `dumpDataDir()` writes a
 * tarball of the data folder, `loadDataDir` opens one. A plain copy of the folder while the database
 * runs could be inconsistent; the dump is taken right after a CHECKPOINT, and each backup is opened
 * for real in memory before it counts as valid.
 *
 * Each backup is two files: `<id>.tar.gz` and its manifest `<id>.json` (hash, size, what it holds).
 * No `server-only`: the database client imports it before the app's server graph exists.
 */

export const BACKUP_REASONS = ["auto", "manual", "before_migration"] as const;
export type BackupReason = (typeof BACKUP_REASONS)[number];

const manifestSchema = z.object({
  id: z.string().regex(/^ezshop-\d{8}-\d{6}-[a-z_]+-[0-9a-f]{6}$/),
  createdAt: z.string(),
  reason: z.enum(BACKUP_REASONS),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  verified: z.boolean(),
  verifiedAt: z.string().nullable(),
  analyses: z.number().int().nonnegative().nullable(),
  migrations: z.number().int().nonnegative().nullable(),
  failure: z.string().nullable(),
});
export type BackupManifest = z.infer<typeof manifestSchema>;

export type BackupFailure = "no_space" | "dump_failed" | "write_failed";

/** Never more than this share of the free disk for one backup, and never under MIN_FREE_BYTES left. */
const MIN_FREE_BYTES = 200 * 1024 * 1024;

export const isBackupId = (id: string): boolean => manifestSchema.shape.id.safeParse(id).success;
export const backupFile = (dir: string, id: string): string => path.join(dir, `${id}.tar.gz`);
const manifestFile = (dir: string, id: string): string => path.join(dir, `${id}.json`);

function idFor(reason: BackupReason, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `ezshop-${stamp}-${reason}-${randomUUID().slice(0, 6)}`;
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function writeAtomic(file: string, bytes: Uint8Array | string): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, bytes, { mode: 0o600 });
    await rename(tmp, file);
  } catch (error: unknown) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function freeBytes(dir: string): Promise<number> {
  const stats = await statfs(dir);
  return stats.bavail * stats.bsize;
}

/** Counts read in a database: the analyses kept, the migrations applied. Null where the table is missing. */
async function contentsOf(pg: PGlite): Promise<{ analyses: number | null; migrations: number | null }> {
  const count = async (sql: string) => {
    try {
      const result = await pg.query<{ n: number }>(sql);
      return result.rows[0]?.n ?? null;
    } catch {
      return null;
    }
  };
  return {
    analyses: await count("select count(*)::int as n from analyses"),
    migrations: await count("select count(*)::int as n from drizzle.__drizzle_migrations"),
  };
}

/**
 * Opens the tarball in a throwaway in-memory database and reads it: the only proof it can be restored.
 * The hash is checked first, so a file damaged on disk is never even opened.
 */
export async function verifyBackupBytes(bytes: Uint8Array, expectedSha256: string): Promise<{ ok: true; analyses: number | null; migrations: number | null } | { ok: false; failure: string }> {
  if (sha256(bytes) !== expectedSha256) return { ok: false, failure: "hash_mismatch" };
  const { PGlite } = await import("@electric-sql/pglite");
  let pg: PGlite | undefined;
  try {
    pg = await PGlite.create({ loadDataDir: new Blob([new Uint8Array(bytes)]) });
    await pg.query("select 1");
    return { ok: true, ...(await contentsOf(pg)) };
  } catch (error: unknown) {
    return { ok: false, failure: error instanceof Error ? error.message.slice(0, 200) : "open_failed" };
  } finally {
    await pg?.close().catch(() => undefined);
  }
}

/** Dumps the running database into `dir`, checks the dump, and writes its manifest. */
export async function writeBackup(pg: PGlite, dir: string, reason: BackupReason, now: Date = new Date()): Promise<{ ok: true; manifest: BackupManifest } | { ok: false; failure: BackupFailure }> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let bytes: Uint8Array;
  try {
    // Writes what is in memory to the data files, so the dump needs no WAL replay to open.
    await pg.query("CHECKPOINT");
    bytes = new Uint8Array(await (await pg.dumpDataDir("gzip")).arrayBuffer());
  } catch (error: unknown) {
    console.error("[backup] dump failed", error instanceof Error ? error.message : error);
    return { ok: false, failure: "dump_failed" };
  }
  if ((await freeBytes(dir)) - bytes.byteLength < MIN_FREE_BYTES) return { ok: false, failure: "no_space" };

  const id = idFor(reason, now);
  const hash = sha256(bytes);
  try {
    await writeAtomic(backupFile(dir, id), bytes);
  } catch (error: unknown) {
    console.error("[backup] write failed", error instanceof Error ? error.message : error);
    return { ok: false, failure: "write_failed" };
  }
  const check = await verifyBackupBytes(bytes, hash);
  const manifest: BackupManifest = {
    id,
    createdAt: now.toISOString(),
    reason,
    bytes: bytes.byteLength,
    sha256: hash,
    verified: check.ok,
    verifiedAt: check.ok ? new Date().toISOString() : null,
    analyses: check.ok ? check.analyses : null,
    migrations: check.ok ? check.migrations : null,
    failure: check.ok ? null : check.failure,
  };
  await writeAtomic(manifestFile(dir, id), JSON.stringify(manifest, null, 2));
  return { ok: true, manifest };
}

/** Every backup of `dir` with a readable manifest, newest first. A missing folder means none. */
export async function listBackups(dir: string): Promise<BackupManifest[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const manifests = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const parsed = manifestSchema.safeParse(JSON.parse(await readFile(path.join(dir, name), "utf8")));
          return parsed.success && `${parsed.data.id}.json` === name ? parsed.data : null;
        } catch {
          return null;
        }
      }),
  );
  return manifests.filter((m): m is BackupManifest => m !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Reads a backup and checks it again (hash, then a real opening). Its manifest records the result. */
export async function recheckBackup(dir: string, manifest: BackupManifest): Promise<{ ok: true; bytes: Uint8Array; manifest: BackupManifest } | { ok: false; manifest: BackupManifest }> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(backupFile(dir, manifest.id)));
  } catch {
    const missing = { ...manifest, verified: false, failure: "file_missing" };
    await writeAtomic(manifestFile(dir, manifest.id), JSON.stringify(missing, null, 2)).catch(() => undefined);
    return { ok: false, manifest: missing };
  }
  const check = await verifyBackupBytes(bytes, manifest.sha256);
  const next: BackupManifest = check.ok
    ? { ...manifest, verified: true, verifiedAt: new Date().toISOString(), analyses: check.analyses, migrations: check.migrations, failure: null }
    : { ...manifest, verified: false, failure: check.failure };
  await writeAtomic(manifestFile(dir, manifest.id), JSON.stringify(next, null, 2)).catch(() => undefined);
  return check.ok ? { ok: true, bytes, manifest: next } : { ok: false, manifest: next };
}

/** Removes one backup (file and manifest). The caller decides whether it may go. */
export async function removeBackup(dir: string, id: string): Promise<void> {
  await rm(backupFile(dir, id), { force: true });
  await rm(manifestFile(dir, id), { force: true });
}

/**
 * The backups that may be removed to keep `keep` of them: the oldest first, and never the newest valid
 * one, whatever `keep` says. A backup that failed its check goes once a newer valid one exists.
 */
export function backupsToPrune(backups: readonly BackupManifest[], keep: number): BackupManifest[] {
  const newestValid = backups.find((b) => b.verified);
  const valid = backups.filter((b) => b.verified);
  const extraValid = valid.slice(Math.max(1, keep));
  const staleInvalid = newestValid ? backups.filter((b) => !b.verified && b.createdAt < newestValid.createdAt) : [];
  return [...extraValid, ...staleInvalid].filter((b) => b.id !== newestValid?.id);
}

/** Migrations in `journal` not yet applied to `pg`: a backup is taken first when there are some. */
export async function pendingMigrations(pg: PGlite, journalFile: string): Promise<number> {
  const journal = z.object({ entries: z.array(z.object({ tag: z.string() })) }).parse(JSON.parse(await readFile(journalFile, "utf8")));
  const applied = (await contentsOf(pg)).migrations;
  return applied === null ? journal.entries.length : Math.max(0, journal.entries.length - applied);
}
