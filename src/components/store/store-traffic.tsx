"use client";

import { KindMarker } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { BarList, SimpleTable, StatGrid, StatTile } from "@/components/web/web-visuals";
import type { StoreTraffic, TrafficCounts, TrafficResult, TrafficSource } from "@/domain/store";
import { AD_PLATFORMS, ratio, trafficInsight } from "@/engine/store/traffic";
import { useFormat, useMessages } from "@/i18n/client";
import type { Formatters } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { Funnel, TrendChart } from "./store-charts";
import { regionName } from "./store-format";

/** Below this many visits, rates are shown with a warning: a few visits more or less move them a lot. */
const FEW_VISITS = 100;

export function Panel({ bar, title, children }: { readonly bar: string; readonly title?: string; readonly children: React.ReactNode }) {
  return (
    <section className="term overflow-hidden">
      <TermBar title={bar} />
      <div className="p-5 sm:p-7">
        {title && <h2 className="mb-5 font-mono text-[17px] font-semibold tracking-[-0.04em]">{title}</h2>}
        {children}
      </div>
    </section>
  );
}

export function duration(seconds: number | null, f: Formatters, m: { readonly seconds: string; readonly minutes: string }): string {
  if (seconds === null) return "—";
  const whole = Math.round(seconds);
  if (whole < 60) return t(m.seconds, { sec: f.int(whole) });
  return t(m.minutes, { min: f.int(Math.floor(whole / 60)), sec: f.int(whole % 60) });
}

const rate = (f: Formatters, value: number | null): string => (value === null ? "—" : f.ratioPct(Math.round(value * 1000) / 1000));

export function StoreTrafficView({ result }: { readonly result: TrafficResult | null }) {
  const m = useMessages("storeLive").traffic;
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="status" className="panel p-5 text-sm leading-relaxed text-muted-foreground sm:p-6">
        {m.failures[result.code]}
      </p>
    );
  }
  return <TrafficReport traffic={result.traffic} />;
}

function TrafficReport({ traffic }: { readonly traffic: StoreTraffic }) {
  const m = useMessages("storeLive").traffic;
  const f = useFormat();
  const insight = trafficInsight(traffic);
  const total = traffic.totals;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tracking-[-0.02em] text-muted-foreground">
        <KindMarker kind="observed" />
        {t(m.period, { since: f.day(traffic.since), until: f.day(traffic.until), bots: f.int(traffic.botSessions) })}
      </p>

      <Panel bar="visites — 30 jours" title={m.title}>
        <StatGrid>
          <StatTile label={m.kpi.sessions} value={f.int(total.sessions)} />
          <StatTile label={m.kpi.visitors} value={f.int(total.visitors)} note={insight.visitsPerVisitor === null ? undefined : t(m.perVisitor, { count: f.number(insight.visitsPerVisitor, { maximumFractionDigits: 2 }) })} />
          <StatTile label={m.kpi.pageviews} value={f.int(total.pageviews)} />
          <StatTile label={m.kpi.repeat} value={f.int(insight.repeatVisits)} note={<span className="inline-flex items-center gap-1.5"><KindMarker kind="derived" />{m.repeatNote}</span>} />
          <StatTile label={m.kpi.carts} value={f.int(total.carts)} note={rate(f, insight.cartRate)} />
          <StatTile label={m.kpi.purchases} value={f.int(total.purchases)} />
          <StatTile label={m.kpi.conversion} value={rate(f, insight.conversionRate)} />
          <StatTile label={m.kpi.bounce} value={rate(f, insight.bounceRate)} />
          <StatTile label={m.kpi.duration} value={duration(total.averageSeconds, f, m)} />
        </StatGrid>
        {total.sessions === 0 && <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{m.none}</p>}
        {total.sessions > 0 && total.sessions < FEW_VISITS && <p className="mt-6 text-xs text-muted-foreground">{m.few}</p>}
      </Panel>

      <div className="grid gap-4 min-[900px]:grid-cols-[2fr_3fr]">
        <Panel bar="visites — parcours">
          <Funnel
            title={m.funnelTitle}
            steps={insight.funnel.map((row) => ({
              key: row.step,
              label: m.funnel[row.step],
              value: row.value,
              display: f.int(row.value),
              rate: row.fromPrevious === null ? undefined : t(m.kept, { rate: rate(f, row.fromPrevious) }),
            }))}
          />
        </Panel>
        <Panel bar="visites — jours">
          <TrendChart
            title={m.dailyTitle}
            days={traffic.byDay.map((d) => d.day)}
            series={[
              { key: "sessions", label: m.funnel.sessions, values: traffic.byDay.map((d) => d.sessions), slot: 1 },
              { key: "carts", label: m.funnel.carts, values: traffic.byDay.map((d) => d.carts), slot: 2 },
              { key: "purchases", label: m.funnel.purchases, values: traffic.byDay.map((d) => d.purchases), slot: 3 },
            ]}
            formatValue={(v) => f.int(Math.round(v))}
            whole
            formatDay={(day) => f.day(day)}
            tableLabel={m.tableView}
            dayLabel={m.day}
          />
        </Panel>
      </div>

      <Panel bar="visites — pubs" title={m.adsTitle}>
        <p className="-mt-2 mb-5 max-w-prose text-sm leading-relaxed text-muted-foreground">{m.adsIntro}</p>
        <StatGrid>
          {AD_PLATFORMS.map((platform) => (
            <StatTile key={platform} label={m.platforms[platform]} value={f.int(insight.fromAds[platform].sessions)} note={purchasesNote(insight.fromAds[platform], f, m.columns.purchases)} />
          ))}
          <StatTile label={m.platforms.paid} value={f.int(insight.paid.sessions)} note={purchasesNote(insight.paid, f, m.columns.purchases)} />
        </StatGrid>
      </Panel>

      {traffic.bySource.length > 0 && (
        <Panel bar="visites — sources" title={m.sourcesTitle}>
          <SimpleTable
            columns={[m.columns.source, m.columns.sessions, m.columns.carts, m.columns.purchases, m.columns.conversion]}
            rows={traffic.bySource.map((source, i) => ({ key: `${source.type}-${source.name ?? ""}-${i}`, cells: [<SourceName key="name" source={source} />, ...countCells(source, f)] }))}
          />
        </Panel>
      )}

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        {traffic.byCountry.length > 0 && (
          <Panel bar="visites — pays" title={m.countriesTitle}>
            <SimpleTable
              columns={[m.columns.country, m.columns.sessions, m.columns.carts, m.columns.purchases, m.columns.conversion]}
              rows={traffic.byCountry.map((row) => ({ key: row.key, cells: [regionName(row.key === "?" ? null : row.key, f.locale, "?"), ...countCells(row, f)] }))}
            />
          </Panel>
        )}
        {traffic.byDevice.length > 0 && (
          <Panel bar="visites — appareils" title={m.devicesTitle}>
            <BarList
              bars={traffic.byDevice.map((row) => ({
                key: row.key,
                label: `${deviceName(row.key, m.devices)} · ${rate(f, ratio(row.sessions, total.sessions))}`,
                value: row.sessions,
                display: f.int(row.sessions),
              }))}
            />
          </Panel>
        )}
      </div>

      {traffic.byLanding.length > 0 && (
        <Panel bar="visites — entrée" title={m.landingTitle}>
          <SimpleTable
            columns={[m.columns.page, m.columns.sessions, m.columns.carts, m.columns.purchases, m.columns.conversion]}
            rows={traffic.byLanding.map((row) => ({ key: row.key, cells: [<span key="path" className="font-mono text-xs break-all">{row.key}</span>, ...countCells(row, f)] }))}
          />
        </Panel>
      )}
    </div>
  );
}

function countCells(row: TrafficCounts, f: Formatters): string[] {
  return [f.int(row.sessions), f.int(row.carts), f.int(row.purchases), rate(f, ratio(row.purchases, row.sessions))];
}

function purchasesNote(counts: TrafficCounts, f: Formatters, label: string): string {
  return `${f.int(counts.purchases)} ${label.toLowerCase()}`;
}

function deviceName(key: string, names: Readonly<Record<string, string>>): string {
  return names[key] ?? key;
}

function SourceName({ source }: { readonly source: TrafficSource }) {
  const m = useMessages("storeLive").traffic;
  const types: Readonly<Record<string, string>> = m.sourceTypes;
  return (
    <span className="flex flex-col">
      <span className="font-medium">{source.name ?? (source.type === "direct" ? m.directName : "—")}</span>
      <span className="text-xs text-muted-foreground">{types[source.type] ?? source.type}</span>
    </span>
  );
}
