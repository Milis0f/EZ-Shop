import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backupFile, backupsToPrune, pendingMigrations, type BackupManifest } from "./backup-files";
import { backupDue, createBackup, deleteLocalBackup, listLocalBackups, recheckLocalBackup, restoreLocalBackup } from "./backup";
import { localDatabase, whileDatabaseClosed } from "./client";

const JOURNAL = path.join(process.cwd(), "drizzle", "meta", "_journal.json");

/** The real thing: a PGlite folder on disk, its backups beside it, restored for real. */
describe("backups of the embedded database", { timeout: 60_000 }, () => {
  let root: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "ezshop-backup-"));
    process.env.PGLITE_DATA_DIR = path.join(root, "pglite");
    process.env.BACKUP_DIR = path.join(root, "backups");
    process.env.BACKUP_KEEP = "2";
    delete process.env.DATABASE_URL;
  });

  afterAll(async () => {
    await whileDatabaseClosed(async () => undefined);
    process.env = saved;
    await rm(root, { recursive: true, force: true });
  });

  const notes = async () => {
    const pg = await localDatabase();
    return (await pg!.query<{ text: string }>("select text from backup_notes order by text")).rows.map((r) => r.text);
  };

  it("takes a backup that reopens, then restores it and keeps the replaced folder", async () => {
    const pg = await localDatabase();
    await pg!.exec("create table backup_notes (text text); insert into backup_notes values ('before');");
    expect(await backupDue()).toBe(true);

    const taken = await createBackup("manual");
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.manifest.verified).toBe(true);
    expect(taken.manifest.analyses).toBe(0);
    expect(taken.manifest.migrations).toBeGreaterThan(0);
    expect(await backupDue()).toBe(false);

    await pg!.exec("insert into backup_notes values ('after');");
    expect(await notes()).toEqual(["after", "before"]);

    const restored = await restoreLocalBackup(taken.manifest.id, new Date("2026-11-03T15:00:00Z"));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(await notes()).toEqual(["before"]);
    // The folder as it was before the restore is still there, whole.
    expect(restored.asideDir && existsSync(path.join(restored.asideDir, "PG_VERSION"))).toBe(true);
  });

  it("refuses a backup whose file changed on disk, and never removes the newest valid one", async () => {
    const [newest] = await listLocalBackups();
    const file = backupFile(process.env.BACKUP_DIR!, newest.id);
    const original = await readFile(file);
    await writeFile(file, Buffer.concat([original, Buffer.from("x")]));

    expect(await recheckLocalBackup(newest.id)).toMatchObject({ ok: false, error: "invalid" });
    expect(await restoreLocalBackup(newest.id)).toEqual({ ok: false, error: "invalid" });

    await writeFile(file, original);
    expect(await recheckLocalBackup(newest.id)).toMatchObject({ ok: true });
    expect(await deleteLocalBackup(newest.id)).toEqual({ ok: false, error: "last_valid" });
  });

  it("keeps BACKUP_KEEP backups", async () => {
    await createBackup("manual");
    await createBackup("auto");
    const backups = await listLocalBackups();
    expect(backups).toHaveLength(2);
    expect(backups.every((b) => b.verified)).toBe(true);
  });

  it("backs an existing database up before migrating it", async () => {
    await whileDatabaseClosed(async () => undefined);
    // A database from before the app's migrations: Postgres is there, the tables are not yet.
    const older = path.join(root, "pglite-older");
    const bare = await PGlite.create(older);
    await bare.exec("create table backup_notes (text text); insert into backup_notes values ('older');");
    await bare.close();
    process.env.PGLITE_DATA_DIR = older;

    expect(await notes()).toEqual(["older"]);
    const before = (await listLocalBackups()).filter((b) => b.reason === "before_migration");
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ verified: true, migrations: null });
  });
});

describe("backupsToPrune", () => {
  const backup = (id: string, createdAt: string, verified: boolean): BackupManifest => ({
    id,
    createdAt,
    reason: "auto",
    bytes: 1,
    sha256: "0".repeat(64),
    verified,
    verifiedAt: null,
    analyses: null,
    migrations: null,
    failure: verified ? null : "hash_mismatch",
  });

  it("removes the oldest valid ones beyond `keep`, and failed ones older than the newest valid", () => {
    const list = [backup("d", "2026-11-04", false), backup("c", "2026-11-03", true), backup("b", "2026-11-02", true), backup("a", "2026-11-01", false)];
    expect(backupsToPrune(list, 1).map((b) => b.id)).toEqual(["b", "a"]);
  });

  it("never removes the newest valid one, even with keep at 0", () => {
    expect(backupsToPrune([backup("a", "2026-11-01", true)], 0)).toEqual([]);
  });

  it("removes nothing when no backup is valid", () => {
    expect(backupsToPrune([backup("b", "2026-11-02", false), backup("a", "2026-11-01", false)], 1)).toEqual([]);
  });
});

describe("pendingMigrations", { timeout: 30_000 }, () => {
  it("counts every migration on a new database, none once migrated", async () => {
    const pg = new PGlite();
    try {
      const journal = JSON.parse(await readFile(JOURNAL, "utf8")) as { entries: unknown[] };
      expect(await pendingMigrations(pg, JOURNAL)).toBe(journal.entries.length);
      await migrate(drizzle(pg), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      expect(await pendingMigrations(pg, JOURNAL)).toBe(0);
    } finally {
      await pg.close();
    }
  });
});
