import { readFile } from "node:fs/promises";
import { apiError } from "@/server/api-response";
import { backupDir } from "@/server/db/client";
import { backupFile, isBackupId } from "@/server/db/backup-files";
import { backupsAvailable } from "@/server/db/backup";
import { isLoopbackHost } from "@/server/local-access";

/** GET /api/backups/:id — the backup file itself, to keep elsewhere (a USB key, another disk). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLoopbackHost(request.headers.get("host") ?? "")) return apiError(403, "forbidden_origin", "This computer only.");
  const { id } = await params;
  if (!backupsAvailable() || !isBackupId(id)) return apiError(404, "not_found", "No such backup.");
  try {
    const bytes = await readFile(backupFile(backupDir(), id));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${id}.tar.gz"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return apiError(404, "not_found", "No such backup.");
  }
}
