"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { useAiInstall } from "@/components/ai/ai-install-store";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { orbitItems, type OrbitItem } from "./orbit-items";
import "./orbit.css";

/**
 * The home of the app: nothing but the planet (drawn by the shell) and its five places around it. A place
 * opens its choices when pointed at, focused or tapped; Escape or a tap elsewhere closes them.
 */
export function OrbitHub() {
  const m = useMessages("shell").orbit;
  const items = orbitItems(m);
  const [open, setOpen] = useState<OrbitItem["key"] | null>(null);
  const hubRef = useRef<HTMLElement>(null);

  // A tap outside closes the open place (touch screens have no hover to leave).
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !hubRef.current?.querySelector(`[data-key="${open}"]`)?.contains(event.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    setOpen(null);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <nav ref={hubRef} aria-label={m.label} className="orbit-hub" onKeyDown={onKeyDown}>
      <h1 className="sr-only">{m.title}</h1>
      <span aria-hidden className="orbit-ring" />
      <ul className="orbit-items">
        {items.map((item, index) => (
          <OrbitPlace key={item.key} item={item} index={index} open={open === item.key} onToggle={() => setOpen((current) => (current === item.key ? null : item.key))} />
        ))}
      </ul>
      <AiStatus />
    </nav>
  );
}

function OrbitPlace({ item, index, open, onToggle }: { readonly item: OrbitItem; readonly index: number; readonly open: boolean; readonly onToggle: () => void }) {
  const Icon = item.icon;
  const panelId = `orbit-${item.key}`;
  const radians = (item.angle * Math.PI) / 180;
  const style = { "--sin": Math.sin(radians).toFixed(4), "--cos": Math.cos(radians).toFixed(4), "--i": index } as CSSProperties;
  return (
    <li data-key={item.key} data-side={item.side} data-open={open || undefined} className="orbit-place" style={style}>
      <button type="button" className="orbit-button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <Icon aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0" />
        <span>{item.title}</span>
      </button>
      <div id={panelId} className="orbit-panel">
        <ul className="orbit-panel-list">
          {item.options.map((option, i) => (
            <li key={option.href} style={{ "--j": i } as CSSProperties}>
              <Link href={option.href} className="orbit-option">
                <span className="orbit-option-label">{option.label}</span>
                <span className="orbit-option-hint">{option.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/** Under the planet when the local AI is not there: what is missing and how to get it. With the AI on, the halo says it. */
function AiStatus() {
  const m = useMessages("shell").orbit;
  const status = useAiInstall();
  if (!status || status.state === "installed") return null;
  const disabled = status.state === "disabled";
  return (
    <div className={cn("orbit-ai", disabled && "orbit-ai-quiet")} role="status">
      <p className="font-mono text-sm font-semibold tracking-[-0.03em]">{disabled ? m.aiDisabled : m.aiOff}</p>
      {!disabled && <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">{m.aiOffHint}</p>}
      {!disabled && <AiInstallButton className="mt-4" />}
      <Link href="/settings#ai" className="mt-3 inline-block text-xs text-muted-foreground underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) hover:text-foreground">
        {m.aiOptions}
      </Link>
    </div>
  );
}
