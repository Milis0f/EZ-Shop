"use client";

import type { ReactNode } from "react";
import type { Change } from "@/engine/store/periods";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { Sparkline } from "./store-charts";

/**
 * A headline figure with its last 30 days drawn small and its change against the 30 days before.
 * Green when it moved the good way, red the bad way; the arrow and the words say it too, so colour is
 * never the only sign.
 */

export function ChangeBadge({ change, lowerIsBetter = false }: { readonly change: Change | null; readonly lowerIsBetter?: boolean }) {
  const m = useMessages("storeBoard").kpi;
  const f = useFormat();
  if (!change || change.direction === null) return <span className="text-xs text-muted-foreground">{m.noPrevious}</span>;
  if (change.direction === "flat") return <span className="store-change store-change-flat">→ {m.flat}</span>;
  const good = (change.direction === "up") !== lowerIsBetter;
  const pct = change.ratio === null ? null : f.ratioPct(Math.round(Math.abs(change.ratio) * 1000) / 1000);
  const words = pct === null ? m.new : t(change.direction === "up" ? m.up : m.down, { pct });
  return (
    <span className={good ? "store-change store-change-good" : "store-change store-change-bad"}>
      <span aria-hidden>{change.direction === "up" ? "▲" : "▼"}</span>
      {words}
    </span>
  );
}

export interface KpiCardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** Null: there is a period before but nothing to compare yet; left out: the source has no period before. */
  readonly change?: Change | null;
  /** The previous period's value, written out; null when there is none. */
  readonly previous?: string | null;
  readonly spark?: readonly number[];
  readonly slot?: 1 | 2 | 3 | 4 | 5;
  readonly lowerIsBetter?: boolean;
  readonly index?: number;
}

export function KpiCard({ label, value, change, previous, spark, slot = 1, lowerIsBetter, index = 0 }: KpiCardProps) {
  const m = useMessages("storeBoard").kpi;
  return (
    <div className="store-kpi flex min-w-0 flex-col gap-2 rounded-panel border border-line bg-[var(--surface)] p-4 sm:p-5" style={{ "--i": index } as React.CSSProperties}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular truncate font-mono text-[clamp(1.25rem,2.2vw,1.7rem)] leading-tight font-semibold tracking-[-0.05em] whitespace-nowrap">{value}</p>
      {change !== undefined && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ChangeBadge change={change} lowerIsBetter={lowerIsBetter} />
        </div>
      )}
      {previous && <p className="text-[11px] text-muted-foreground">{t(m.versus, { value: previous })}</p>}
      {spark && spark.length > 1 && <Sparkline values={spark} slot={slot} className="mt-auto pt-1" />}
    </div>
  );
}
