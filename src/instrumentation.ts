/**
 * Runs once when the server starts (Node.js runtime only): the secrets kept in the system's credential
 * store are loaded first, then periodic backups start, and the background worker takes the research
 * still waiting from before the stop.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const [{ loadVaultIntoEnv, systemVault }, { SECRET_ENV_NAMES }] = await Promise.all([import("./server/secrets/vault"), import("./config/connector-fields")]);
  await loadVaultIntoEnv(SECRET_ENV_NAMES, await systemVault()).catch(() => 0);
  const [{ startBackupSchedule }, { jobWorker }] = await Promise.all([import("./server/db/backup-schedule"), import("./server/jobs")]);
  startBackupSchedule();
  // A few seconds after the start, so the first page is not kept waiting by the database opening.
  setTimeout(() => jobWorker().kick(), 5_000).unref();
}
