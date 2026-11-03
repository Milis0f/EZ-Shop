import "server-only";
import { backupDue, backupsAvailable, createBackup } from "./backup";

/**
 * Periodic backups while the app runs: a first look two minutes after the start, then every hour; a
 * backup is taken when the newest valid one is older than BACKUP_INTERVAL_HOURS (24 h by default).
 */

const FIRST_LOOK_MS = 2 * 60_000;
const LOOK_EVERY_MS = 60 * 60_000;

const globalForSchedule = globalThis as unknown as { __ezShopBackupTimer?: ReturnType<typeof setInterval> };

async function look(): Promise<void> {
  try {
    if (!(await backupDue())) return;
    const result = await createBackup("auto");
    if (!result.ok) console.error("[backup] periodic backup failed:", result.error);
    else if (!result.manifest.verified) console.error("[backup] periodic backup could not be reopened:", result.manifest.failure);
  } catch (error: unknown) {
    console.error("[backup] periodic backup failed:", error instanceof Error ? error.message : error);
  }
}

export function startBackupSchedule(): void {
  if (globalForSchedule.__ezShopBackupTimer || !backupsAvailable()) return;
  setTimeout(() => void look(), FIRST_LOOK_MS).unref();
  globalForSchedule.__ezShopBackupTimer = setInterval(() => void look(), LOOK_EVERY_MS);
  globalForSchedule.__ezShopBackupTimer.unref();
}
