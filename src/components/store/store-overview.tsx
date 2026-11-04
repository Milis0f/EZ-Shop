"use client";

import type { ReactNode } from "react";
import { BarList, exactPrice } from "@/components/web/web-visuals";
import type { StoreSummary, StoreTraffic } from "@/domain/store";
import { alignDays, change, dayRange, type SalesPeriods } from "@/engine/store/periods";
import { ratio, trafficInsight } from "@/engine/store/traffic";
import { useFormat, useMessages } from "@/i18n/client";
import { plural, t } from "@/i18n/translate";
import { Donut, Funnel, TrendChart, type DonutSlice } from "./store-charts";
import { monthName, regionName, shortDay as dayLabel, shortList } from "./store-format";
import { KpiCard } from "./store-kpis";
import { Panel } from "./store-traffic";
import type { Tab } from "./store-tabs";

/**
 * The first screen of "My store": the six figures that matter with their change, then the visits and
 * the revenue day by day next to the period before, where the visits come from and how they turn into
 * orders. Everything is what Shopify reported.
 */

const DAY_MS = 86_400_000;
const DONUT_SLICES = 5;

export interface OverviewProps {
  readonly summary: StoreSummary;
  readonly periods: SalesPeriods | null;
  readonly traffic: StoreTraffic | null;
  readonly currency: string;
  readonly onOpen: (tab: Tab) => void;
  /** Shown right under the headline figures. */
  readonly highlight?: ReactNode;
}

export function StoreOverviewBoard({ summary, periods, traffic, currency, onOpen, highlight }: OverviewProps) {
  const m = useMessages("storeBoard");
  const live = useMessages("storeLive").traffic;
  const s = useMessages("store");
  const f = useFormat();
  const money = (value: number) => exactPrice(f, value, currency);
  const shortDay = (day: string) => dayLabel(day, f.locale);

  const days = traffic ? dayRange(Date.parse(`${traffic.until}T12:00:00Z`), 30) : (periods?.current.days ?? []);
  const previousDays = days.length ? dayRange(Date.parse(`${days[0]}T12:00:00Z`) - DAY_MS, 30) : [];
  const visits = traffic ? alignDays(days, traffic.byDay, (d) => d.sessions) : [];
  const visitsBefore = traffic?.previous ? alignDays(previousDays, traffic.previous.byDay, (d) => d.sessions) : null;
  const before = traffic?.previous?.totals ?? null;
  const total = traffic?.totals ?? null;
  const conversion = total ? ratio(total.purchases, total.sessions) : null;
  const conversionBefore = before ? ratio(before.purchases, before.sessions) : null;
  const pct = (value: number | null) => (value === null ? "—" : f.ratioPct(Math.round(value * 1000) / 1000));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3 min-[1180px]:grid-cols-6">
        <KpiCard index={0} label={m.kpi.visits} value={total ? f.int(total.sessions) : "—"} change={total ? change(total.sessions, before?.sessions ?? null) : null} previous={before ? f.int(before.sessions) : null} spark={visits} slot={1} />
        <KpiCard index={1} label={m.kpi.visitors} value={total ? f.int(total.visitors) : "—"} change={total ? change(total.visitors, before?.visitors ?? null) : null} previous={before ? f.int(before.visitors) : null} slot={1} />
        <KpiCard
          index={2}
          label={m.kpi.revenue}
          value={periods ? money(periods.current.totalRevenue) : money(summary.revenue)}
          change={periods?.revenue ?? null}
          previous={periods?.previous ? money(periods.previous.totalRevenue) : null}
          spark={periods?.current.revenue}
          slot={2}
        />
        <KpiCard index={3} label={m.kpi.orders} value={f.int(periods?.current.totalOrders ?? summary.orders)} change={periods?.orders ?? null} previous={periods?.previous ? f.int(periods.previous.totalOrders) : null} spark={periods?.current.orders} slot={3} />
        <KpiCard index={4} label={m.kpi.conversion} value={pct(conversion)} change={conversion !== null ? change(conversion, conversionBefore) : null} previous={conversionBefore !== null ? pct(conversionBefore) : null} />
        <KpiCard
          index={5}
          label={m.kpi.averageOrder}
          value={periods?.current.averageOrder != null ? money(periods.current.averageOrder) : "—"}
          change={periods?.current.averageOrder != null ? periods.averageOrder : null}
          previous={periods?.previous?.averageOrder != null ? money(periods.previous.averageOrder) : null}
        />
      </div>

      {highlight}
      <Insights summary={summary} />

      <div className="grid gap-4 min-[1000px]:grid-cols-2">
        <Panel bar="ma-boutique — visites">
          {traffic && total && total.sessions > 0 ? (
            <TrendChart
              title={m.charts.visitsTitle}
              days={days}
              series={[
                { key: "now", label: m.charts.current, values: visits, slot: 1 },
                ...(visitsBefore ? [{ key: "before", label: m.charts.previous, values: visitsBefore, slot: 1 as const, dashed: true }] : []),
              ]}
              formatValue={(v) => f.int(v)}
              formatDay={shortDay}
              tableLabel={m.charts.table}
              dayLabel={m.charts.day}
              whole
            />
          ) : (
            <Empty title={m.charts.visitsTitle} text={m.empty.visits} />
          )}
        </Panel>
        <Panel bar="ma-boutique — ventes">
          {periods && periods.current.totalOrders > 0 ? (
            <TrendChart
              title={m.charts.revenueTitle}
              days={periods.current.days}
              series={[
                { key: "now", label: m.charts.current, values: periods.current.revenue, slot: 2 },
                ...(periods.previous ? [{ key: "before", label: m.charts.previous, values: periods.previous.revenue, slot: 2 as const, dashed: true }] : []),
              ]}
              formatValue={(v) => money(v)}
              formatDay={shortDay}
              tableLabel={m.charts.table}
              dayLabel={m.charts.day}
            />
          ) : (
            <Empty title={m.charts.revenueTitle} text={m.empty.sales} />
          )}
        </Panel>
      </div>

      {traffic && total && total.sessions > 0 && (
        <div className="grid gap-4 min-[1000px]:grid-cols-[3fr_2fr]">
          <Panel bar="visites — sources">
            <Donut title={m.charts.sourcesTitle} slices={sourceSlices(traffic, live.sourceTypes, m.charts.other, f.int)} total={f.int(total.sessions)} totalLabel={m.charts.sourcesTotal} />
          </Panel>
          <Panel bar="visites — parcours">
            <FunnelBlock traffic={traffic} />
          </Panel>
        </div>
      )}

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        {summary.revenue > 0 && (
          <Panel bar="ventes — mois" title={s.monthTitle}>
            <BarList bars={summary.byMonth.map((row) => ({ key: row.month, label: monthName(row.month, f.locale), value: row.revenue, display: money(row.revenue) }))} />
          </Panel>
        )}
        <Panel bar="ventes — pays" title={s.countryTitle}>
          {summary.byCountry.length ? (
            <BarList
              bars={summary.byCountry.slice(0, 8).map((row) => ({
                key: row.country ?? "?",
                label: `${regionName(row.country, f.locale, "?")} · ${f.pct(Math.round(row.share * 100))}`,
                value: row.revenue,
                display: money(row.revenue),
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{s.noOrders}</p>
          )}
          <button type="button" onClick={() => onOpen("countries")} className="mt-4 text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-foreground">
            {s.tabs.countries}
          </button>
        </Panel>
      </div>
    </div>
  );
}

/** What stands out in the sales, in sentences: the main country, the countries without sales, stock. */
function Insights({ summary }: { readonly summary: StoreSummary }) {
  const m = useMessages("store");
  const f = useFormat();
  const names = new Map(summary.products.map((p) => [p.id, p.title]));
  const top = summary.byCountry[0];
  const lines = [
    top?.country ? t(m.insights.topCountry, { country: regionName(top.country, f.locale, m.countries.unknown), share: f.pct(Math.round(top.share * 100)) }) : null,
    summary.shipsWithoutSales.length
      ? plural(f.locale, summary.shipsWithoutSales.length, m.insights.shipsWithoutSales, { count: f.int(summary.shipsWithoutSales.length), list: shortList(summary.shipsWithoutSales.map((c) => regionName(c, f.locale, c))) })
      : null,
    summary.lowStock.length ? t(m.insights.lowStock, { list: shortList(summary.lowStock.map((id) => names.get(id) ?? id)) }) : null,
    summary.unsold.length ? t(m.insights.unsold, { list: shortList(summary.unsold.map((id) => names.get(id) ?? id)) }) : null,
  ].filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  return (
    <Panel bar="ma-boutique — constats" title={m.insightsTitle}>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {lines.map((line, i) => (
          <li key={line} className="store-arrive flex gap-3" style={{ animationDelay: `${i * 70}ms` }}>
            <span aria-hidden className="font-mono text-muted-foreground">
              →
            </span>
            {line}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Empty({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <div className="flex min-h-48 flex-col gap-3">
      <p className="text-sm font-medium">{title}</p>
      <div aria-hidden className="store-empty-line" />
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

/** Visits by kind of source; past four kinds, the rest are folded into "Other". */
function sourceSlices(traffic: StoreTraffic, names: Readonly<Record<string, string>>, other: string, int: (v: number) => string): DonutSlice[] {
  const byType = new Map<string, number>();
  for (const source of traffic.bySource) byType.set(source.type, (byType.get(source.type) ?? 0) + source.sessions);
  const sorted = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, sorted.length > DONUT_SLICES ? DONUT_SLICES - 1 : DONUT_SLICES);
  const rest = sorted.slice(head.length).reduce((s, [, v]) => s + v, 0);
  const slices = head.map(([type, value]) => ({ key: type, label: names[type] ?? type, value, display: int(value) }));
  return rest > 0 ? [...slices, { key: "other", label: other, value: rest, display: int(rest) }] : slices;
}

function FunnelBlock({ traffic }: { readonly traffic: StoreTraffic }) {
  const m = useMessages("storeBoard").charts;
  const live = useMessages("storeLive").traffic;
  const f = useFormat();
  const insight = trafficInsight(traffic);
  const before = traffic.previous ? trafficInsight({ ...traffic, totals: traffic.previous.totals }) : null;
  const rate = (value: number | null) => (value === null ? "—" : f.ratioPct(Math.round(value * 1000) / 1000));
  return (
    <div className="flex flex-col gap-4">
      <Funnel
        title={m.funnelTitle}
        steps={insight.funnel.map((row) => ({
          key: row.step,
          label: live.funnel[row.step],
          value: row.value,
          display: f.int(row.value),
          rate: row.fromPrevious === null ? undefined : rate(row.fromPrevious),
        }))}
      />
      {before && <p className="text-xs text-muted-foreground">{t(m.funnelVersus, { value: rate(before.conversionRate) })}</p>}
    </div>
  );
}
