import "server-only";
import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { getEnv } from "@/config/env";
import {
  backupsToPrune,
  isBackupId,
  listBackups,
  recheckBackup,
  removeBackup,
  writeBackup,
  type BackupManifest,
  type BackupReason,
} from "./backup-files";
import { backupDir, localDatabase, whileDatabaseClosed } from "./client";

/**
 * The backup service of the app: take, list, check, restore and remove backups of the embedded
 * database. With DATABASE_URL (Postgres), backups belong to Postgres' own tools: everything says so.
 */

export type BackupError = "postgres" | "not_found" | "invalid" | "last_valid" | "no_space" | "dump_failed" | "write_failed" | "restore_failed";

export const backupsAvailable = (): boolean => !getEnv().DATABASE_URL;

export async function listLocalBackups(): Promise<BackupManifest[]> {
  return backupsAvailable() ? listBackups(backupDir()) : [];
}

/** Takes a backup now, then removes the oldest beyond BACKUP_KEEP (never the newest valid one). */
export async function createBackup(reason: BackupReason): Promise<{ ok: true; manifest: BackupManifest } | { ok: false; error: BackupError }> {
  const pg = await localDatabase();
  if (!pg) return { ok: false, error: "postgres" };
  const result = await writeBackup(pg, backupDir(), reason);
  if (!result.ok) return { ok: false, error: result.failure };
  await pruneBackups();
  return result;
}

export async function pruneBackups(): Promise<number> {
  const dir = backupDir();
  const extra = backupsToPrune(await listBackups(dir), getEnv().BACKUP_KEEP);
  for (const backup of extra) await removeBackup(dir, backup.id);
  return extra.length;
}

async function find(id: string): Promise<BackupManifest | null> {
  if (!backupsAvailable() || !isBackupId(id)) return null;
  return (await listBackups(backupDir())).find((b) => b.id === id) ?? null;
}

export async function recheckLocalBackup(id: string): Promise<{ ok: boolean; manifest?: BackupManifest; error?: BackupError }> {
  const manifest = await find(id);
  if (!manifest) return { ok: false, error: "not_found" };
  const check = await recheckBackup(backupDir(), manifest);
  return check.ok ? { ok: true, manifest: check.manifest } : { ok: false, manifest: check.manifest, error: "invalid" };
}

/** Removes one backup on request; the newest valid one stays whatever happens. */
export async function deleteLocalBackup(id: string): Promise<{ ok: true } | { ok: false; error: BackupError }> {
  const manifest = await find(id);
  if (!manifest) return { ok: false, error: "not_found" };
  const newestValid = (await listBackups(backupDir())).find((b) => b.verified);
  if (newestValid?.id === id) return { ok: false, error: "last_valid" };
  await removeBackup(backupDir(), id);
  return { ok: true };
}

/** Folder name the current database is moved to before a restore: it is kept, never erased. */
const asideName = (dataDir: string, now: Date) => `${dataDir}-avant-restauration-${now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}`;

/**
 * Restores a backup: it is checked again, the database is closed, its folder is moved aside (kept,
 * even when damaged), and the backup is opened into a new folder at the same place. If anything
 * fails, the folder moved aside comes back and nothing is lost.
 */
export async function restoreLocalBackup(id: string, now: Date = new Date()): Promise<{ ok: true; asideDir: string | null } | { ok: false; error: BackupError }> {
  const manifest = await find(id);
  if (!manifest) return { ok: false, error: "not_found" };
  const check = await recheckBackup(backupDir(), manifest);
  if (!check.ok) return { ok: false, error: "invalid" };

  const { PGlite } = await import("@electric-sql/pglite");
  return whileDatabaseClosed(async (dataDir) => {
    const aside = existsSync(dataDir) ? asideName(dataDir, now) : null;
    if (aside) await rename(dataDir, aside);
    try {
      const pg = await PGlite.create(dataDir, { loadDataDir: new Blob([new Uint8Array(check.bytes)]) });
      await pg.query("select 1");
      await pg.close();
      return { ok: true as const, asideDir: aside };
    } catch (error: unknown) {
      console.error("[backup] restore failed", error instanceof Error ? error.message : error);
      // Only the folder this restore just created goes; the original comes back.
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
      if (aside) await rename(aside, dataDir).catch(() => undefined);
      return { ok: false as const, error: "restore_failed" as const };
    }
  });
}

/** A periodic backup is due when no valid one is younger than BACKUP_INTERVAL_HOURS. */
export async function backupDue(now: Date = new Date()): Promise<boolean> {
  if (!backupsAvailable()) return false;
  const newestValid = (await listLocalBackups()).find((b) => b.verified);
  if (!newestValid) return true;
  return now.getTime() - Date.parse(newestValid.createdAt) >= getEnv().BACKUP_INTERVAL_HOURS * 3_600_000;
}
