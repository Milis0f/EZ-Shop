/** Runs once when the server starts: periodic backups of the embedded database (Node.js runtime only). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { startBackupSchedule } = await import("./server/db/backup-schedule");
  startBackupSchedule();
}
