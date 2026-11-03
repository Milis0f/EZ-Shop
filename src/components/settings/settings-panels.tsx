"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setAiEnabled, setAiGpu, setAiModel } from "@/app/settings/actions";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { refreshAiInstall, startAiInstall, stopAiInstall, useAiInstall } from "@/components/ai/ai-install-store";
import { setMode, useMode } from "@/components/layout/mode-toggle";
import { TermBar } from "@/components/marketing/term";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { Button } from "@/components/ui/button";
import type { AiMachine, AiModelChoice } from "@/domain/ai-settings";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import "./settings-panels.css";

export interface AiSettingsData {
  readonly machine: AiMachine;
  readonly choices: readonly AiModelChoice[];
  /** The configured model: one of the catalogue, or a file of the owner's own. */
  readonly active: { readonly name: string; readonly license: string; readonly custom: boolean };
  readonly editable: boolean;
}

const BYTES_PER_GB = 1_000_000_000;
/** Memory is counted the way the computer's own sheet states it (a "16 GB" card holds 16 × 1024³ bytes). */
const BYTES_PER_GIB = 1024 ** 3;
/** Room kept free on the disk beyond the model itself, as the installer does. */
const SPARE_DISK_BYTES = 1_000_000_000;

/** File sizes in GB as Hugging Face states them; memory (`binary`) as the computer states it. */
function useGigabytes(binary = false): (bytes: number) => string {
  const m = useMessages("web").install;
  const f = useFormat();
  const unit = binary ? BYTES_PER_GIB : BYTES_PER_GB;
  return (bytes) => {
    const digits = bytes >= 10 * unit ? 0 : 1;
    return t(m.gigabytes, { value: f.number(bytes / unit, { maximumFractionDigits: digits, minimumFractionDigits: digits }) });
  };
}

export function SettingsSection({ id, bar, title, intro, children }: { readonly id?: string; readonly bar: string; readonly title: string; readonly intro: string; readonly children: React.ReactNode }) {
  return (
    <section id={id} className="term scroll-mt-24 overflow-hidden">
      <TermBar title={bar} />
      <div className="p-5 sm:p-7">
        <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{title}</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{intro}</p>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

export function AiSettings({ data }: { readonly data: AiSettingsData }) {
  const m = useMessages("settings").ai;
  const status = useAiInstall();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const state = status?.state ?? "unknown";
  const canToggle = data.editable && (state === "installed" || state === "disabled");

  function toggle(enabled: boolean) {
    startTransition(async () => {
      const result = await setAiEnabled(enabled);
      setMessage(result.ok ? m.toggled : (result.reason ?? m.toggleFailed));
      if (result.ok) await refreshAiInstall();
    });
  }

  return (
    <div id="ai" className="flex scroll-mt-24 flex-col gap-4">
      <SettingsSection bar="réglages — ia" title={m.title} intro={m.intro}>
        <p className="font-mono text-sm font-semibold tracking-[-0.03em]">{m.states[state]}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t(data.active.custom ? m.custom : m.model, { name: data.active.name, license: data.active.license })}</p>
        <AiInstallButton className="mt-6 items-start text-left" />
        {canToggle && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="button" variant={state === "installed" ? "outline" : "default"} disabled={pending} onClick={() => toggle(state !== "installed")}>
              {state === "installed" ? m.turnOff : m.turnOn}
            </Button>
            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
            )}
          </div>
        )}
        {!data.editable && <p className="mt-4 text-xs text-muted-foreground">{m.readOnly}</p>}
      </SettingsSection>
      <MachinePanel machine={data.machine} />
      <GpuSettings mode={data.machine.gpuMode} editable={data.editable} />
      <ModelPicker choices={data.choices} diskFree={data.machine.diskFree} editable={data.editable} />
    </div>
  );
}

function MemoryBar({ label, total, used, ai, children }: { readonly label: string; readonly total: number; readonly used: number; readonly ai: number | null; readonly children?: React.ReactNode }) {
  const m = useMessages("settings").machine;
  const gb = useGigabytes(true);
  const share = (value: number) => `${total > 0 ? Math.min(100, (value / total) * 100) : 0}%`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular text-xs text-muted-foreground">{t(m.used, { used: gb(used), total: gb(total) })}</span>
      </div>
      <div className="memory-track" aria-hidden>
        <span className="memory-used" style={{ width: share(used) }} />
        {ai !== null && ai > 0 && <span className="memory-ai" style={{ width: share(ai) }} />}
      </div>
      <p className="text-xs text-muted-foreground">
        {ai !== null && ai > 0 ? (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="memory-ai-key" />
            {t(m.aiShare, { size: gb(ai) })}
          </span>
        ) : (
          m.aiIdle
        )}
        {children}
      </p>
    </div>
  );
}

function MachinePanel({ machine }: { readonly machine: AiMachine }) {
  const m = useMessages("settings").machine;
  const gb = useGigabytes();
  const f = useFormat();
  const gpu = machine.gpu;
  return (
    <SettingsSection bar="réglages — machine" title={m.title} intro={m.intro}>
      <div className="grid gap-6 min-[900px]:grid-cols-2">
        <MemoryBar label={m.memory} total={machine.ramTotal} used={machine.ramTotal - machine.ramFree} ai={machine.ai?.ram ?? null} />
        {gpu && !gpu.unified ? (
          <MemoryBar label={`${m.graphics} · ${gpu.names.join(", ") || gpu.backend}`} total={gpu.vramTotal} used={gpu.vramUsed} ai={machine.ai?.vram ?? null}>
            {machine.gpuMode === "off" && <span className="mt-1 block">{m.gpuOff}</span>}
            {machine.ai?.layers && (
              <span className="mt-1 block">
                {t(machine.ai.layers.onGpu >= machine.ai.layers.total ? m.layersAll : m.layersSplit, {
                  onGpu: f.int(machine.ai.layers.onGpu),
                  total: f.int(machine.ai.layers.total),
                  backend: machine.ai.layers.backend || "CPU",
                })}
              </span>
            )}
          </MemoryBar>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{m.graphics}</span>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {gpu?.unified ? `${gpu.names.join(", ") || gpu.backend} · ${m.shared}` : machine.gpuProbe === "failed" ? m.gpuFailed : m.gpuNone}
            </p>
          </div>
        )}
      </div>
      <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{m.processor}</dt>
          <dd className="mt-1">{t(m.threads, { name: machine.cpu, count: f.int(machine.threads) })}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{m.disk}</dt>
          <dd className="tabular mt-1">{machine.diskFree === null ? "—" : gb(machine.diskFree)}</dd>
        </div>
      </dl>
    </SettingsSection>
  );
}

function GpuSettings({ mode, editable }: { readonly mode: "auto" | "off"; readonly editable: boolean }) {
  const m = useMessages("settings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function choose(next: "auto" | "off") {
    if (next === mode) return;
    startTransition(async () => {
      const result = await setAiGpu(next);
      setMessage(result.ok ? m.ai.toggled : (result.reason ?? m.ai.toggleFailed));
      if (result.ok) router.refresh();
    });
  }

  return (
    <SettingsSection bar="réglages — carte graphique" title={m.gpu.title} intro={m.gpu.intro}>
      <div className={cn("flex flex-wrap items-center gap-3", (pending || !editable) && "pointer-events-none opacity-60")}>
        <SegmentedControl
          options={[
            { value: "auto", label: m.gpu.auto },
            { value: "off", label: m.gpu.off },
          ]}
          value={mode}
          onChange={choose}
          aria-label={m.gpu.title}
        />
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </div>
    </SettingsSection>
  );
}

function ModelPicker({ choices, diskFree, editable }: { readonly choices: readonly AiModelChoice[]; readonly diskFree: number | null; readonly editable: boolean }) {
  const m = useMessages("settings").models;
  const router = useRouter();
  const status = useAiInstall();
  const download = status?.download ?? null;
  const busy = download?.phase === "downloading" || download?.phase === "verifying";
  const [pending, startTransition] = useTransition();
  const [switched, setSwitched] = useState<string | null>(null);

  // Once a download ends, the page reads the disk again so the model shows as downloaded.
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) router.refresh();
    wasBusy.current = busy;
  }, [busy, router]);

  function use(id: string) {
    startTransition(async () => {
      const result = await setAiModel(id);
      if (result.ok) {
        setSwitched(id);
        await refreshAiInstall();
        router.refresh();
      }
    });
  }

  return (
    <SettingsSection bar="réglages — modèles" title={m.title} intro={m.intro}>
      <ol className="grid gap-3 min-[900px]:grid-cols-2">
        {choices.map((choice) => (
          <ModelCard
            key={choice.id}
            choice={choice}
            download={download?.model === choice.id ? download : null}
            otherBusy={busy && download?.model !== choice.id}
            roomy={diskFree === null || diskFree >= choice.bytes + SPARE_DISK_BYTES}
            editable={editable && !pending}
            onUse={() => use(choice.id)}
            switched={switched === choice.id && choice.active}
          />
        ))}
      </ol>
      <p className="mt-5 text-xs text-muted-foreground">{m.estimate}</p>
    </SettingsSection>
  );
}

interface ModelCardProps {
  readonly choice: AiModelChoice;
  readonly download: NonNullable<ReturnType<typeof useAiInstall>>["download"] | null;
  readonly otherBusy: boolean;
  readonly roomy: boolean;
  readonly editable: boolean;
  readonly onUse: () => void;
  readonly switched: boolean;
}

function ModelCard({ choice, download, otherBusy, roomy, editable, onUse, switched }: ModelCardProps) {
  const m = useMessages("settings").models;
  const gb = useGigabytes();
  const memory = useGigabytes(true);
  const running = download?.phase === "downloading" || download?.phase === "verifying";
  const percent = download && download.totalBytes > 0 ? Math.min(100, (download.downloadedBytes / download.totalBytes) * 100) : 0;
  return (
    <li className={cn("model-card flex flex-col gap-3 rounded-panel border p-4 sm:p-5", choice.active ? "border-[var(--craie)]" : "border-line")} data-fit={choice.fit}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[15px] font-semibold tracking-[-0.03em]">{m.tiers[choice.tier]}</span>
        {choice.recommended && <span className="rounded-pill border border-[var(--verdict-oui)] px-2 py-0.5 text-[11px] text-[var(--verdict-oui)]">{m.recommended}</span>}
        {choice.active && <span className="rounded-pill bg-[var(--craie)] px-2 py-0.5 text-[11px] font-medium text-[var(--noir)]">{m.inUse}</span>}
        {!choice.active && choice.onDisk && <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] text-muted-foreground">{m.onDisk}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{choice.name}</p>
      <p className="text-sm leading-relaxed">{m.tierHints[choice.tier]}</p>
      <p className="flex items-center gap-2 text-xs">
        <span aria-hidden className="model-fit-dot" />
        {m.fits[choice.fit]}
      </p>
      <p className="tabular text-xs text-muted-foreground">
        {t(m.size, { size: gb(choice.bytes) })} · {t(m.needs, { size: memory(choice.needBytes) })}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        {running && download ? (
          <div className="flex w-full flex-col gap-2" aria-live="polite">
            <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={choice.name} className="memory-track">
              <span className="memory-ai" style={{ width: `${percent}%` }} />
            </div>
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular">{download.phase === "verifying" ? m.verifying : t(m.progress, { done: gb(download.downloadedBytes), total: gb(download.totalBytes) })}</span>
              {download.phase === "downloading" && (
                <Button type="button" variant="ghost" size="sm" onClick={() => void stopAiInstall()}>
                  {m.stop}
                </Button>
              )}
            </div>
          </div>
        ) : choice.active ? null : choice.onDisk ? (
          <Button type="button" size="sm" disabled={!editable} onClick={onUse}>
            {m.use}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={!editable || otherBusy || !roomy} onClick={() => void startAiInstall(choice.id)}>
            {t(m.download, { size: gb(choice.bytes) })}
          </Button>
        )}
        {!running && !choice.onDisk && !roomy && <p className="text-xs text-muted-foreground">{m.noSpace}</p>}
        {!running && !choice.onDisk && otherBusy && <p className="text-xs text-muted-foreground">{m.busy}</p>}
        {download?.phase === "failed" && <p className="text-xs text-muted-foreground">{m.failed}</p>}
        {switched && (
          <p role="status" className="text-xs text-muted-foreground">
            {m.switched}
          </p>
        )}
      </div>
    </li>
  );
}

export function ModeSettings() {
  const m = useMessages("settings").mode;
  const mode = useMode() ?? "simple";
  return (
    <SettingsSection bar="réglages — analyse" title={m.title} intro={m.intro}>
      <SegmentedControl
        options={[
          { value: "simple", label: m.simple },
          { value: "advanced", label: m.advanced },
        ]}
        value={mode}
        onChange={setMode}
        aria-label={m.title}
      />
    </SettingsSection>
  );
}
