"use client";

import { Button } from "@/components/ui/button";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { startAiInstall, stopAiInstall, useAiInstall } from "./ai-install-store";
import "./ai-install.css";

const ANNOUNCED_GB = 5.7;
const BYTES_PER_GB = 1_000_000_000;

/**
 * The one way to get the local AI: centred, white with a faint touch of colour, shown only while the AI
 * is not there. Renders nothing once it is installed or turned off.
 */
export function AiInstallButton({ className }: { readonly className?: string }) {
  const m = useMessages("web").install;
  const f = useFormat();
  const status = useAiInstall();
  if (!status || status.state === "installed" || status.state === "disabled") return null;

  const gb = (bytes: number) => t(m.gigabytes, { value: f.number(bytes / BYTES_PER_GB, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) });
  const busy = status.state === "downloading" || status.state === "verifying";
  const percent = status.totalBytes > 0 ? Math.min(100, (status.downloadedBytes / status.totalBytes) * 100) : 0;

  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      {!busy && (
        <span className="ai-install-aura">
          <button type="button" onClick={() => void startAiInstall()} className="ai-install-button">
            {status.state === "failed" ? m.retry : m.button}
          </button>
        </span>
      )}
      {busy && (
        <div className="flex w-full max-w-sm flex-col items-center gap-3" aria-live="polite">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label={m.button}
            className="ai-install-track"
          >
            <span className="ai-install-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="tabular text-sm text-muted-foreground">
            {status.state === "verifying" ? m.verifying : t(m.downloading, { done: gb(status.downloadedBytes), total: gb(status.totalBytes) })}
          </p>
          {status.state === "downloading" && (
            <Button type="button" variant="ghost" onClick={() => void stopAiInstall()}>
              {m.stop}
            </Button>
          )}
        </div>
      )}
      {status.state === "failed" && status.error && (
        <p role="alert" className="text-sm text-muted-foreground">
          {m.errors[status.error]}
        </p>
      )}
      {!busy && status.state !== "failed" && <p className="text-xs text-muted-foreground">{t(m.hint, { size: gb(ANNOUNCED_GB * BYTES_PER_GB) })}</p>}
    </div>
  );
}
