"use client";

import type { ReactNode } from "react";
import { KindMarker, type MarkerKind } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { DATA_INSUFFICIENT } from "@/domain/datum";
import type { CompetitorResponse } from "@/domain/web";
import type { Formatters } from "@/i18n/format";
import { exactPrice } from "./web-visuals";

/** Small pieces shared by the parts of the competitor report. */

export type Ready = Extract<CompetitorResponse, { status: "ready" }>;

export function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-medium break-words sm:text-right">{value}</dd>
    </div>
  );
}

export function Insufficient() {
  return (
    <span className="inline-flex items-center gap-2 font-normal text-muted-foreground">
      <KindMarker kind="insufficient" />
      {DATA_INSUFFICIENT}
    </span>
  );
}

/** One part of the report, in the terminal panels of the rest of the app; the marker says what kind of value it holds. */
export function ReportPanel({ bar, title, kind, intro, children }: { readonly bar: string; readonly title: string; readonly kind?: MarkerKind; readonly intro?: string; readonly children: ReactNode }) {
  return (
    <section className="term overflow-hidden">
      <TermBar title={bar} />
      <div className="p-5 sm:p-7">
        <h3 className="flex items-center gap-2 font-mono text-[16px] font-semibold tracking-[-0.04em]">
          {kind && <KindMarker kind={kind} />}
          {title}
        </h3>
        {intro && <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{intro}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

export function priceText(o: Ready["observed"], f: Formatters): string | null {
  if (o.priceMin === null) return null;
  const money = (v: number) => exactPrice(f, v, o.currency);
  return o.priceMax !== null && o.priceMax !== o.priceMin ? `${money(o.priceMin)} – ${money(o.priceMax)}` : money(o.priceMin);
}

const DAY_MS = 86_400_000;
const DAYS_PER_MONTH = 30.44;

/** Since when the shop is online: the domain's registration, else its first archived page, else its oldest product. */
export function onlineSince(result: Ready): string | null {
  return result.domainSignals?.registeredAt ?? result.domainSignals?.firstArchivedAt ?? result.catalogue?.oldestPublishedAt ?? null;
}

export function monthsSince(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / DAY_MS / DAYS_PER_MONTH));
}

/** Estimated counts: whole numbers past 10, one decimal below, so a small range does not read as zero. */
export function estimateNumber(value: number, f: Formatters): string {
  return value >= 10 ? f.int(Math.round(value)) : f.number(value, { maximumFractionDigits: 1 });
}
