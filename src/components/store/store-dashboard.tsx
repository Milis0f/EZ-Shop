"use client";

import { useState } from "react";
import { KindMarker } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { PlanetScene } from "@/components/planet/planet-hooks";
import { exactPrice } from "@/components/web/web-visuals";
import "@/components/web/web-visuals.css";
import { COUNTRY_CODES, type CountryCode } from "@/domain/country";
import type { AdsResult, StoreSummary } from "@/domain/store";
import { trafficInsight } from "@/engine/store/traffic";
import { useFormat, useMessages } from "@/i18n/client";
import { plural, t } from "@/i18n/translate";
import "./store-board.css";
import { InstagramView, StoreWebPanel, StripeView, Waiting } from "./store-channels";
import { StoreConnect, type StoreConnections } from "./store-connect";
import { regionName } from "./store-format";
import { StoreHero } from "./store-hero";
import { StoreMarketView } from "./store-market";
import { StoreOverviewBoard } from "./store-overview";
import { StoreProducts } from "./store-products";
import { StoreReviewPanel } from "./store-review";
import { TABS, type Tab } from "./store-tabs";
import { StoreTrafficView } from "./store-traffic";
import { StoreAds } from "./store-ads";
import { useStoreData } from "./use-store-data";

export type { Tab } from "./store-tabs";

export interface StoreDashboardProps {
  /** What the settings say, before anything is read. */
  readonly connections: Omit<StoreConnections, "grantedScopes">;
  /** Ad reports read in the last ten minutes. */
  readonly keptAds: Readonly<Record<"meta" | "google", AdsResult | null>>;
  /** The section the planet's menu opened. */
  readonly initialTab?: Tab;
}

const isCovered = (code: string): code is CountryCode => (COUNTRY_CODES as readonly string[]).includes(code);

/** "My store": every source read live and at once; one section at a time, so nothing piles up. */
export function StoreDashboard({ connections: settings, keptAds, initialTab }: StoreDashboardProps) {
  const m = useMessages("store");
  const board = useMessages("storeBoard");
  const f = useFormat();
  const data = useStoreData({ planetMessage: board.arrival.planet, stepLabel: (part) => board.arrival.sources[part] });
  const payload = data.store.status === "done" ? data.store.data : null;
  const result = payload?.result ?? null;
  const snapshot = result?.ok ? result.snapshot : null;
  const summary = payload?.summary ?? null;
  const traffic = data.traffic.status === "done" ? data.traffic.data : null;
  const [tab, setTab] = useState<Tab>(initialTab ?? (settings.shopify.configured ? "overview" : "connect"));
  // The menu can open another section while this page is shown.
  const [askedTab, setAskedTab] = useState(initialTab);
  if (askedTab !== initialTab) {
    setAskedTab(initialTab);
    if (initialTab) setTab(initialTab);
  }

  const connections: StoreConnections = { ...settings, grantedScopes: snapshot ? snapshot.grantedScopes : null };
  const shipsTo = snapshot ? snapshot.shop.shipsTo.filter(isCovered) : [];
  const selling = summary ? summary.byCountry.map((row) => row.country).filter((code): code is CountryCode => code !== null && isCovered(code)) : [];
  const planetCountries = selling.length ? selling : shipsTo;
  const visits = traffic?.ok ? trafficInsight(traffic.traffic).fromAds : null;
  const loadingStore = data.store.status === "loading";
  const tabs = TABS.map((value) => ({ value, label: m.tabs[value] }));

  return (
    <div className="flex flex-col gap-6">
      {planetCountries[0] && <PlanetScene focus={planetCountries[0]} countries={planetCountries} />}
      <StoreHero data={data} />

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} aria-label={m.tabsLabel} className="max-w-none" />
      </div>

      {snapshot && summary ? (
        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[-0.02em] text-muted-foreground">
            <KindMarker kind="observed" />
            {t(m.readAt, { date: f.date(snapshot.readAt), since: f.day(snapshot.ordersSince) })}
            <span>{m.apart}</span>
          </p>
          {summary.testOnly && <Note>{m.testOnly}</Note>}
          {snapshot.countriesHidden && <Note>{m.countriesHidden}</Note>}
          {snapshot.ordersCapped && <Note>{t(m.ordersCapped, { count: f.int(snapshot.orders.length) })}</Note>}
          {snapshot.productsCapped && <Note>{t(m.productsCapped, { count: f.int(snapshot.products.length) })}</Note>}
        </div>
      ) : (
        result &&
        !result.ok &&
        !["connect", "traffic", "social", "payments", "ads"].includes(tab) && (
          <p role="status" className="panel p-5 text-sm text-muted-foreground sm:p-6">
            {m.failures[result.code]}
          </p>
        )
      )}

      {tab === "overview" &&
        (loadingStore ? (
          <OverviewWaiting />
        ) : (
          snapshot &&
          summary && (
            <div className="flex flex-col gap-4">
              <StoreOverviewBoard
                summary={summary}
                periods={payload?.periods ?? null}
                traffic={traffic?.ok ? traffic.traffic : null}
                currency={summary.currency}
                onOpen={setTab}
                highlight={<AiCard onOpen={() => setTab("advice")} />}
              />
              <div className="grid gap-4 min-[1000px]:grid-cols-2">
                <InstagramView state={data.instagram} compact />
                <StripeView state={data.stripe} compact />
              </div>
              <StoreWebPanel state={data.web} />
            </div>
          )
        ))}
      {tab === "traffic" && (data.traffic.status === "loading" ? <Waiting /> : <StoreTrafficView result={traffic} />)}
      {tab === "market" && <StoreMarketView />}
      {tab === "social" && <InstagramView state={data.instagram} />}
      {tab === "payments" && <StripeView state={data.stripe} />}
      {tab === "advice" && <StoreReviewPanel />}
      {tab === "products" && snapshot && summary && <StoreProducts summary={summary} taxesIncluded={snapshot.shop.taxesIncluded} analysisCountries={shipsTo} />}
      {tab === "countries" && snapshot && summary && <StoreCountries summary={summary} shipsTo={snapshot.shop.shipsTo} />}
      {tab === "ads" && <StoreAds connections={connections} kept={keptAds} siteVisits={visits} />}
      {tab === "connect" && <StoreConnect connections={connections} failure={result && !result.ok ? result.code : null} />}
    </div>
  );
}

function OverviewWaiting() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-3 min-[1180px]:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="store-wait !min-h-32" />
        ))}
      </div>
      <div className="grid gap-4 min-[1000px]:grid-cols-2">
        <div className="store-wait !min-h-64" />
        <div className="store-wait !min-h-64" />
      </div>
    </div>
  );
}

function AiCard({ onOpen }: { readonly onOpen: () => void }) {
  const m = useMessages("storeBoard").ai;
  return (
    <section className="store-ai term relative overflow-hidden">
      <TermBar title="ma-boutique — ia locale" />
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="max-w-prose">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{m.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.intro}</p>
        </div>
        <button type="button" onClick={onOpen} className="store-ai-button shrink-0 rounded-pill px-6 py-2.5 text-sm font-semibold">
          {m.open}
        </button>
      </div>
    </section>
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
