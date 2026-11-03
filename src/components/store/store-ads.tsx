"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loadStoreAds } from "@/app/store/actions";
import { TermBar } from "@/components/marketing/term";
import { Button } from "@/components/ui/button";
import { exactPrice, SimpleTable, StatGrid, StatTile } from "@/components/web/web-visuals";
import type { AdsReport, AdsResult, AdsRow, TrafficCounts } from "@/domain/store";
import { costPerPurchase, roas } from "@/engine/store/summary";
import { ratio } from "@/engine/store/traffic";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { Funnel, TrendChart, type FunnelStepView } from "./store-charts";
import { regionName } from "./store-format";
import type { StoreConnections } from "./store-connect";

type Platform = "meta" | "google";

export interface StoreAdsProps {
  readonly connections: StoreConnections;
  /** Reports already read in the last ten minutes, shown without asking the platform again. */
  readonly kept: Readonly<Record<Platform, AdsResult | null>>;
  /** Paid visits the store saw from each platform; null when the visits could not be read. */
  readonly siteVisits: Readonly<Record<Platform, TrafficCounts>> | null;
}

export function StoreAds({ connections, kept, siteVisits }: StoreAdsProps) {
  const m = useMessages("store").ads;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {m.intro} {m.unverified}
      </p>
      <AdsCard platform="meta" title={m.meta} configured={connections.meta.configured} initial={kept.meta} siteVisits={siteVisits?.meta ?? null} notConfigured={m.metaNotConfigured} />
      <AdsCard
        platform="google"
        title={m.google}
        configured={connections.google}
        initial={kept.google}
        siteVisits={siteVisits?.google ?? null}
        notConfigured={
          <>
            {m.googleNotConfigured}{" "}
            <Link href="/connectors" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
              /connectors
            </Link>
          </>
        }
      />
      <section className="term overflow-hidden">
        <TermBar title="pubs — tiktok" />
        <div className="p-5 sm:p-7">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{m.tiktok}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{m.tiktokNote}</p>
        </div>
      </section>
    </div>
  );
}

interface AdsCardProps {
  readonly platform: Platform;
  readonly title: string;
  readonly configured: boolean;
  readonly initial: AdsResult | null;
  readonly siteVisits: TrafficCounts | null;
  readonly notConfigured: React.ReactNode;
}

function AdsCard({ platform, title, configured, initial, siteVisits, notConfigured }: AdsCardProps) {
  const m = useMessages("store").ads;
  const [result, setResult] = useState<AdsResult | null>(initial);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      // A second click means "read it again now".
      setResult(await loadStoreAds(platform, result !== null));
    });
  }

  return (
    <section className="term overflow-hidden">
      <TermBar title={`pubs — ${platform}`} />
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{title}</h2>
          {configured && (
            <Button type="button" variant={result ? "outline" : "default"} size="sm" disabled={pending} onClick={load}>
              {pending ? m.loading : result ? m.reload : m.load}
            </Button>
          )}
        </div>
        {!configured && <p className="mt-2 text-sm text-muted-foreground">{notConfigured}</p>}
        {result && !result.ok && (
          <p role="alert" className="mt-3 text-sm text-muted-foreground">
            {m.failures[result.code]}
          </p>
        )}
        {result?.ok && <AdsReportView report={result.report} siteVisits={siteVisits} />}
      </div>
    </section>
  );
}

function adsFunnel(row: AdsRow, labels: Readonly<Record<"impressions" | "linkClicks" | "landingViews" | "addToCart" | "checkouts" | "purchases", string>>, clicksLabel: string): { key: string; label: string; value: number }[] {
  const steps: { key: string; label: string; value: number | null | undefined }[] = [
    { key: "impressions", label: labels.impressions, value: row.impressions },
    // Meta separates clicks to the site from the other clicks; Google's clicks already go to the site.
    row.linkClicks !== undefined && row.linkClicks !== null ? { key: "linkClicks", label: labels.linkClicks, value: row.linkClicks } : { key: "clicks", label: clicksLabel, value: row.clicks },
    { key: "landingViews", label: labels.landingViews, value: row.landingViews },
    { key: "addToCart", label: labels.addToCart, value: row.addToCart },
    { key: "checkouts", label: labels.checkouts, value: row.checkouts },
    { key: "purchases", label: labels.purchases, value: row.purchases },
  ];
  return steps.flatMap((step) => (step.value === null || step.value === undefined ? [] : [{ key: step.key, label: step.label, value: step.value }]));
}

function AdsReportView({ report, siteVisits }: { readonly report: AdsReport; readonly siteVisits: TrafficCounts | null }) {
  const m = useMessages("store").ads;
  const live = useMessages("storeLive");
  const f = useFormat();
  const money = (value: number | null) => (value === null ? "—" : exactPrice(f, value, report.currency));
  const count = (value: number | null | undefined) => (value === null || value === undefined ? "—" : f.number(value, { maximumFractionDigits: 1 }));
  const ratioText = (value: number | null) => (value === null ? "—" : f.number(value, { maximumFractionDigits: 2 }));
  const c = m.columns;
  const rows = (list: readonly AdsRow[], country: boolean) =>
    list.map((row) => ({
      key: row.label,
      cells: [
        country && /^[A-Z]{2}$/.test(row.label) ? regionName(row.label, f.locale, row.label) : row.label,
        money(row.spend),
        f.int(row.impressions),
        f.int(row.clicks),
        count(row.addToCart),
        count(row.purchases),
        money(row.purchaseValue),
        ratioText(roas(row)),
        money(costPerPurchase(row)),
      ],
    }));
  const columns = [c.label, c.spend, c.impressions, c.clicks, live.ads.funnel.addToCart, c.purchases, c.value, c.roas, c.cpa];
  const funnel: FunnelStepView[] = adsFunnel(report.total, live.ads.funnel, c.clicks).map((step, i, all) => {
    const before = all[i - 1];
    const kept = before ? ratio(step.value, before.value) : null;
    return { ...step, display: f.int(Math.round(step.value)), rate: kept === null ? undefined : t(live.traffic.kept, { rate: f.ratioPct(Math.round(kept * 1000) / 1000) }) };
  });

  if (report.total.spend === 0 && report.campaigns.length === 0) return <p className="mt-3 text-sm text-muted-foreground">{m.none}</p>;
  return (
    <div className="mt-5 flex flex-col gap-7">
      <StatGrid>
        <StatTile label={c.spend} value={money(report.total.spend)} />
        {report.total.reach !== undefined && report.total.reach !== null && <StatTile label={live.ads.reach} value={f.int(report.total.reach)} />}
        <StatTile label={c.purchases} value={count(report.total.purchases)} />
        <StatTile label={c.roas} value={ratioText(roas(report.total))} />
        <StatTile label={c.cpa} value={money(costPerPurchase(report.total))} />
        {siteVisits && <StatTile label={live.ads.siteVisits} value={f.int(siteVisits.sessions)} note={live.ads.siteVisitsNote} />}
      </StatGrid>
      <div className="grid gap-6 min-[900px]:grid-cols-[2fr_3fr]">
        {funnel.length > 1 && <Funnel title={live.ads.funnelTitle} steps={funnel} />}
        {report.byDay.length > 1 && (
          <TrendChart
            title={live.ads.dailyTitle}
            days={report.byDay.map((d) => d.day)}
            series={[{ key: "spend", label: live.ads.spend, values: report.byDay.map((d) => d.spend), slot: 1 }]}
            formatValue={(v) => exactPrice(f, Math.round(v * 100) / 100, report.currency)}
            formatDay={(day) => f.day(day)}
            tableLabel={live.traffic.tableView}
            dayLabel={live.traffic.day}
          />
        )}
      </div>
      {report.byCountry.length > 0 && <SimpleTable title={m.byCountry} columns={columns} rows={rows(report.byCountry, true)} />}
      {report.campaigns.length > 0 && <SimpleTable title={m.campaigns} columns={columns} rows={rows(report.campaigns, false)} />}
      <p className="text-xs text-muted-foreground">
        {m.attributed} {t(live.ads.cached, { date: f.date(report.readAt) })}
      </p>
    </div>
  );
}
