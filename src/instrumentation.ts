/**
 * Runs once when the server starts (Node.js runtime only): periodic backups of the embedded database,
 * and the background worker, which takes the research still waiting from before the stop.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const [{ startBackupSchedule }, { jobWorker }] = await Promise.all([import("./server/db/backup-schedule"), import("./server/jobs")]);
  startBackupSchedule();
  // A few seconds after the start, so the first page is not kept waiting by the database opening.
  setTimeout(() => jobWorker().kick(), 5_000).unref();
}
