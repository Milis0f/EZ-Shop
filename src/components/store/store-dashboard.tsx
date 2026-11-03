"use client";

import { useState } from "react";
import { KindMarker } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { BarList, exactPrice, StatGrid, StatTile } from "@/components/web/web-visuals";
import "@/components/web/web-visuals.css";
import type { CountryCode } from "@/domain/country";
import type { AdsResult, StoreResult, StoreSummary, TrafficResult } from "@/domain/store";
import { trafficInsight } from "@/engine/store/traffic";
import { useFormat, useMessages } from "@/i18n/client";
import { plural, t } from "@/i18n/translate";
import { StoreAds } from "./store-ads";
import { StoreReviewPanel } from "./store-review";
import { StoreTrafficView } from "./store-traffic";
import { StoreConnect, type StoreConnections } from "./store-connect";
import { monthName, regionName, shortList } from "./store-format";
import { StoreProducts } from "./store-products";
import { TABS, type Tab } from "./store-tabs";

export type { Tab } from "./store-tabs";

export interface StoreDashboardProps {
  readonly result: StoreResult;
  readonly summary: StoreSummary | null;
  readonly connections: StoreConnections;
  /** Visits of the site over 30 days; null when the store is not read. */
  readonly traffic: TrafficResult | null;
  /** Ad reports read in the last ten minutes. */
  readonly keptAds: Readonly<Record<"meta" | "google", AdsResult | null>>;
  /** Countries a product of the store can be analysed in before launch: those it ships to that the app covers. */
  readonly analysisCountries: readonly CountryCode[];
  /** The section the planet's menu opened. */
  readonly initialTab?: Tab;
}

/** "My store": one section at a time, so the owner's data never piles up into a wall of panels. */
export function StoreDashboard({ result, summary, connections, traffic, keptAds, analysisCountries, initialTab }: StoreDashboardProps) {
  const m = useMessages("store");
  const f = useFormat();
  const [tab, setTab] = useState<Tab>(initialTab ?? (result.ok ? "overview" : "connect"));
  // The menu can open another section while this page is shown.
  const [askedTab, setAskedTab] = useState(initialTab);
  if (askedTab !== initialTab) {
    setAskedTab(initialTab);
    if (initialTab) setTab(initialTab);
  }
  const tabs = TABS.map((value) => ({ value, label: m.tabs[value] }));
  const visits = traffic?.ok ? trafficInsight(traffic.traffic).fromAds : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} aria-label={m.tabsLabel} className="max-w-none" />
      </div>

      {result.ok && summary ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[-0.02em] text-muted-foreground">
          <KindMarker kind="observed" />
          {t(m.readAt, { date: f.date(result.snapshot.readAt), since: f.day(result.snapshot.ordersSince) })}
          <span>{m.apart}</span>
        </p>
      ) : (
        tab !== "connect" &&
        tab !== "traffic" && (
          <p role="status" className="panel p-5 text-sm text-muted-foreground sm:p-6">
            {m.failures[result.ok ? "api_error" : result.code]}
          </p>
        )
      )}

      {result.ok && summary && (
        <div className="flex flex-col gap-3">
          {summary.testOnly && <Note>{m.testOnly}</Note>}
          {result.snapshot.countriesHidden && <Note>{m.countriesHidden}</Note>}
          {result.snapshot.ordersCapped && <Note>{t(m.ordersCapped, { count: f.int(result.snapshot.orders.length) })}</Note>}
          {result.snapshot.productsCapped && <Note>{t(m.productsCapped, { count: f.int(result.snapshot.products.length) })}</Note>}
        </div>
      )}

      {tab === "overview" && result.ok && summary && <StoreOverview summary={summary} traffic={traffic?.ok ? traffic : null} onOpen={setTab} />}
      {tab === "traffic" && <StoreTrafficView result={traffic} />}
      {tab === "advice" && <StoreReviewPanel />}
      {tab === "products" && result.ok && summary && (
        <StoreProducts summary={summary} taxesIncluded={result.snapshot.shop.taxesIncluded} analysisCountries={analysisCountries} />
      )}
      {tab === "countries" && result.ok && summary && <StoreCountries summary={summary} shipsTo={result.snapshot.shop.shipsTo} />}
      {tab === "ads" && <StoreAds connections={connections} kept={keptAds} siteVisits={visits} />}
      {tab === "connect" && <StoreConnect connections={connections} failure={result.ok ? null : result.code} />}
    </div>
  );
}

function Note({ children }: { readonly children: React.ReactNode }) {
  return <p className="rounded-tile border border-line bg-surface px-5 py-3.5 text-sm text-muted-foreground">{children}</p>;
}

function Section({ title, bar, children }: { readonly title: string; readonly bar: string; readonly children: React.ReactNode }) {
  return (
    <section className="term overflow-hidden">
      <TermBar title={bar} />
      <div className="p-5 sm:p-7">
        <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{title}</h2>
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}

function StoreOverview({ summary, traffic, onOpen }: { readonly summary: StoreSummary; readonly traffic: Extract<TrafficResult, { ok: true }> | null; readonly onOpen: (tab: Tab) => void }) {
  const m = useMessages("store");
  const live = useMessages("storeLive").traffic;
  const f = useFormat();
  const visits = traffic ? trafficInsight(traffic.traffic) : null;
  const money = (value: number) => exactPrice(f, value, summary.currency);
  const names = new Map(summary.products.map((p) => [p.id, p.title]));
  const top = summary.byCountry[0];
  const insights = [
    top?.country ? t(m.insights.topCountry, { country: regionName(top.country, f.locale, m.countries.unknown), share: f.pct(Math.round(top.share * 100)) }) : null,
    summary.shipsWithoutSales.length
      ? plural(f.locale, summary.shipsWithoutSales.length, m.insights.shipsWithoutSales, { count: f.int(summary.shipsWithoutSales.length), list: shortList(summary.shipsWithoutSales.map((c) => regionName(c, f.locale, c))) })
      : null,
    summary.lowStock.length ? t(m.insights.lowStock, { list: shortList(summary.lowStock.map((id) => names.get(id) ?? id)) }) : null,
    summary.unsold.length ? t(m.insights.unsold, { list: shortList(summary.unsold.map((id) => names.get(id) ?? id)) }) : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="flex flex-col gap-4">
      <section className="term overflow-hidden">
        <TermBar title="ma-boutique — ventes" />
        <StatGrid className="p-5 sm:p-7">
          <StatTile label={m.kpi.revenue} value={money(summary.revenue)} />
          <StatTile label={m.kpi.orders} value={f.int(summary.orders)} />
          <StatTile label={m.kpi.averageOrder} value={summary.averageOrder === null ? "—" : money(summary.averageOrder)} />
          <StatTile label={m.kpi.units} value={f.int(summary.units)} />
          <StatTile label={m.kpi.taxes} value={money(summary.taxes)} />
          <StatTile label={m.kpi.shipping} value={money(summary.shipping)} />
          <StatTile label={m.kpi.refunds} value={money(summary.refunds)} />
        </StatGrid>
      </section>

      {summary.orders === 0 && <Note>{m.noOrders}</Note>}

      {traffic && visits && (
        <section className="term overflow-hidden">
          <TermBar title="ma-boutique — visites" />
          <div className="flex flex-col gap-5 p-5 sm:p-7">
            <StatGrid>
              <StatTile label={live.kpi.sessions} value={f.int(traffic.traffic.totals.sessions)} />
              <StatTile label={live.kpi.carts} value={f.int(traffic.traffic.totals.carts)} />
              <StatTile label={live.kpi.purchases} value={f.int(traffic.traffic.totals.purchases)} />
              <StatTile label={live.kpi.conversion} value={visits.conversionRate === null ? "—" : f.ratioPct(Math.round(visits.conversionRate * 1000) / 1000)} />
            </StatGrid>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <button type="button" onClick={() => onOpen("traffic")} className="font-medium underline decoration-line underline-offset-4 hover:decoration-foreground">
                {m.tabs.traffic}
              </button>
              <button type="button" onClick={() => onOpen("advice")} className="font-medium underline decoration-line underline-offset-4 hover:decoration-foreground">
                {m.tabs.advice}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="term overflow-hidden">
        <TermBar title="ma-boutique — constats" />
        <div className="p-5 sm:p-7">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{m.insightsTitle}</h2>
          {insights.length ? (
            <ul className="mt-4 flex flex-col gap-2 text-sm leading-relaxed">
              {insights.map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden className="font-mono text-muted-foreground">
                    →
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{m.insights.none}</p>
          )}
        </div>
      </section>

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <Section title={m.monthTitle} bar="ventes — mois">
          <BarList bars={summary.byMonth.map((row) => ({ key: row.month, label: monthName(row.month, f.locale), value: row.revenue, display: money(row.revenue) }))} />
        </Section>
        <Section title={m.countryTitle} bar="ventes — pays">
          {summary.byCountry.length ? (
            <BarList
              bars={summary.byCountry.slice(0, 8).map((row) => ({
                key: row.country ?? "?",
                label: `${regionName(row.country, f.locale, m.countries.unknown)} · ${f.pct(Math.round(row.share * 100))}`,
                value: row.revenue,
                display: money(row.revenue),
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{m.noOrders}</p>
          )}
        </Section>
      </div>

      <Section title={m.productTitle} bar="ventes — produits">
        {summary.products.some((p) => p.units > 0) ? (
          <BarList
            bars={summary.products
              .filter((p) => p.units > 0)
              .slice(0, 8)
              .map((p) => ({ key: p.id, label: `${p.title} · ${f.int(p.units)}`, value: p.revenue, display: money(p.revenue) }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{summary.products.length ? m.noOrders : m.noProducts}</p>
        )}
      </Section>
    </div>
  );
}

function StoreCountries({ summary, shipsTo }: { readonly summary: StoreSummary; readonly shipsTo: readonly string[] }) {
  const m = useMessages("store");
  const f = useFormat();
  const money = (value: number) => exactPrice(f, value, summary.currency);
  const c = m.countries.columns;
  return (
    <div className="flex flex-col gap-4">
      <Section title={m.countryTitle} bar="pays — ventes">
        {summary.byCountry.length ? (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={m.countryTitle}>
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted-foreground">
                  {[c.country, c.orders, c.revenue, c.share, c.taxes, c.shipping].map((label) => (
                    <th key={label} scope="col" className="py-2 pr-5 font-normal last:pr-0">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.byCountry.map((row) => (
                  <tr key={row.country ?? "?"}>
                    <td className="py-2.5 pr-5 font-medium">{regionName(row.country, f.locale, m.countries.unknown)}</td>
                    <td className="tabular py-2.5 pr-5">{f.int(row.orders)}</td>
                    <td className="tabular py-2.5 pr-5">{money(row.revenue)}</td>
                    <td className="tabular py-2.5 pr-5">{f.pct(Math.round(row.share * 100))}</td>
                    <td className="tabular py-2.5 pr-5">{money(row.taxes)}</td>
                    <td className="tabular py-2.5">{money(row.shipping)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{m.noOrders}</p>
        )}
      </Section>

      <Section title={m.countries.withoutSales} bar="pays — livrés">
        <p className="text-sm text-muted-foreground">{shipsTo.length ? plural(f.locale, shipsTo.length, m.countries.shipsTo, { count: f.int(shipsTo.length) }) : m.countries.none}</p>
        {summary.shipsWithoutSales.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {summary.shipsWithoutSales.map((code) => (
              <li key={code} className="rounded-pill border border-line px-3 py-1 font-mono text-xs tracking-[-0.02em]">
                {regionName(code, f.locale, code)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
