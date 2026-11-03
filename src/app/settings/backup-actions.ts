"use server";

import { revalidatePath } from "next/cache";
import { isLocalRequest } from "@/server/connector-config";
import { createBackup, deleteLocalBackup, recheckLocalBackup, restoreLocalBackup, type BackupError } from "@/server/db/backup";
import { isBackupId } from "@/server/db/backup-files";
import { checkRateLimit } from "@/server/rate-limit";

/**
 * Backups from the settings page. They work in production too (the future desktop app runs a
 * production build): only a request of this computer may touch them, which the proxy checks first.
 */

export type BackupActionResult =
  | { readonly ok: true; readonly done: "created" | "checked" | "restored" | "removed"; readonly path?: string }
  | { readonly ok: false; readonly error: BackupError | "remote" | "tooMany" | "failed" };

const LIMIT = { limit: 12, windowMs: 60_000 } as const;

async function guarded(scope: string, work: () => Promise<BackupActionResult>): Promise<BackupActionResult> {
  if (!(await isLocalRequest())) return { ok: false, error: "remote" };
  if (!checkRateLimit(`backup:${scope}`, LIMIT.limit, LIMIT.windowMs).allowed) return { ok: false, error: "tooMany" };
  try {
    return await work();
  } catch (error: unknown) {
    console.error(`[backup:${scope}]`, error instanceof Error ? error.message : error);
    return { ok: false, error: "failed" };
  } finally {
    revalidatePath("/settings");
  }
}

export async function backupNow(): Promise<BackupActionResult> {
  return guarded("create", async () => {
    const result = await createBackup("manual");
    return result.ok ? { ok: true, done: "created" } : { ok: false, error: result.error };
  });
}

export async function checkBackup(id: string): Promise<BackupActionResult> {
  if (typeof id !== "string" || !isBackupId(id)) return { ok: false, error: "not_found" };
  return guarded("check", async () => {
    const result = await recheckLocalBackup(id);
    return result.ok ? { ok: true, done: "checked" } : { ok: false, error: result.error ?? "invalid" };
  });
}

export async function restoreBackup(id: string): Promise<BackupActionResult> {
  if (typeof id !== "string" || !isBackupId(id)) return { ok: false, error: "not_found" };
  return guarded("restore", async () => {
    const result = await restoreLocalBackup(id);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath("/", "layout");
    return { ok: true, done: "restored", ...(result.asideDir && { path: result.asideDir }) };
  });
}

export async function removeBackup(id: string): Promise<BackupActionResult> {
  if (typeof id !== "string" || !isBackupId(id)) return { ok: false, error: "not_found" };
  return guarded("remove", async () => {
    const result = await deleteLocalBackup(id);
    return result.ok ? { ok: true, done: "removed" } : { ok: false, error: result.error };
  });
}
