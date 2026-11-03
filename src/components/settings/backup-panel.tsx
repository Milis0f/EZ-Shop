"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { backupNow, checkBackup, removeBackup, restoreBackup, type BackupActionResult } from "@/app/settings/backup-actions";
import { Button } from "@/components/ui/button";
import type { BackupManifest } from "@/server/db/backup-files";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { SettingsSection } from "./settings-panels";

export interface BackupPanelData {
  readonly available: boolean;
  readonly backups: readonly BackupManifest[];
  readonly folder: string;
  readonly dataDir: string;
  readonly keep: number;
}

type Confirming = { readonly id: string; readonly action: "restore" | "remove" } | null;

const BYTES_PER_MB = 1_000_000;

export function BackupPanel({ data }: { readonly data: BackupPanelData }) {
  const m = useMessages("backup");
  const f = useFormat();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const newestValid = data.backups.find((b) => b.verified)?.id;

  function run(work: () => Promise<BackupActionResult>) {
    setConfirming(null);
    startTransition(async () => {
      const result = await work();
      setMessage(result.ok ? t(m.done[result.done], { path: result.path ?? "" }) : m.errors[result.error]);
      router.refresh();
    });
  }

  if (!data.available) {
    return (
      <SettingsSection id="backups" bar="réglages — sauvegardes" title={m.title} intro={m.postgres}>
        {null}
      </SettingsSection>
    );
  }

  return (
    <SettingsSection id="backups" bar="réglages — sauvegardes" title={m.title} intro={m.intro}>
      <p className="font-mono text-xs break-all text-muted-foreground">{t(m.folder, { path: data.folder })}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t(m.keep, { count: f.int(data.keep) })}</p>
      <Button type="button" className="mt-5" disabled={pending} onClick={() => run(backupNow)}>
        {pending ? m.working : m.now}
      </Button>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
        {message}
      </p>

      {data.backups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{m.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
          {data.backups.map((backup) => (
            <li key={backup.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold tracking-[-0.03em]">
                  {f.date(backup.createdAt)} · {m.reasons[backup.reason]}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {backup.verified ? t(m.valid, { date: backup.verifiedAt ? f.date(backup.verifiedAt) : "" }) : t(m.invalid, { failure: backup.failure ?? "" })}
                  {backup.analyses !== null && ` · ${t(m.holds, { count: f.int(backup.analyses) })}`}
                  {` · ${t(m.size, { size: f.number(backup.bytes / BYTES_PER_MB, { maximumFractionDigits: 1 }) })}`}
                </p>
                {confirming?.id === backup.id && confirming.action === "restore" && <p className="mt-2 text-xs break-all text-muted-foreground">{t(m.restoreHint, { path: data.dataDir })}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {confirming?.id === backup.id ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant={confirming.action === "remove" ? "destructive" : "default"}
                      disabled={pending}
                      onClick={() => run(() => (confirming.action === "restore" ? restoreBackup(backup.id) : removeBackup(backup.id)))}
                    >
                      {confirming.action === "restore" ? m.confirmRestore : m.confirmRemove}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      {m.cancel}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/backups/${backup.id}`} download>
                        {m.download}
                      </a>
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => checkBackup(backup.id))}>
                      {m.check}
                    </Button>
                    {backup.verified && (
                      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming({ id: backup.id, action: "restore" })}>
                        {m.restore}
                      </Button>
                    )}
                    {backup.id !== newestValid && (
                      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming({ id: backup.id, action: "remove" })}>
                        {m.remove}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
