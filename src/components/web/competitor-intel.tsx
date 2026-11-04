"use client";

import type { MarkerKind } from "@/components/data/kind-marker";
import { KindMarker } from "@/components/data/kind-marker";
import type { DataNature, SourcedValue } from "@/domain/data-nature";
import { TECHNOLOGY_CATEGORIES } from "@/domain/competitor";
import { useFormat, useMessages } from "@/i18n/client";
import type { Formatters } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { Fact, Insufficient, ReportPanel, type Ready } from "./competitor-bits";
import { exactPrice, SimpleTable } from "./web-visuals";

/**
 * The competitive-intelligence parts of the report: the visibility profile (published indicators,
 * never visits), the technologies seen, what the site declares, and the history kept on this computer.
 */

const NATURE_MARKER: Readonly<Record<DataNature, MarkerKind>> = {
  observed: "observed",
  published: "observed",
  declared: "observed",
  provider_estimated: "estimate",
  ezshop_estimated: "estimate",
  inferred: "assumption",
  unknown: "insufficient",
};

/** Registries read with the domain, which are not connectors of their own. */
const REGISTRY_NAMES: Readonly<Record<string, string>> = { tranco: "Tranco", "internet-archive": "Internet Archive" };

const LEVEL_TONE = { low: "var(--verdict-non)", medium: "var(--verdict-surveiller)", high: "var(--verdict-oui)" } as const;

function indicatorValue(v: SourcedValue, f: Formatters, present: string): string {
  if (v.value === null) return "";
  if (v.metric === "crux_presence") return present;
  if (v.metric === "crux_cls_p75") return f.number(v.value, { maximumFractionDigits: 2 });
  if (v.unit === "ms") return `${f.int(Math.round(v.value))} ms`;
  if (v.metric === "open_page_rank") return f.number(v.value, { maximumFractionDigits: 2 });
  return f.int(Math.round(v.value));
}

function VisibilityProfile({ visibility }: { readonly visibility: NonNullable<Ready["visibility"]> }) {
  const m = useMessages("competitorReport").intel;
  const names = useMessages("connectors").providerNames;
  const f = useFormat();
  const shown = visibility.indicators.filter((v) => v.metric in m.metrics);
  const failed = visibility.indicators.filter((v) => !(v.metric in m.metrics));
  const attributions = [...new Set(shown.map((v) => v.attribution).filter((a): a is string => Boolean(a)))];
  const label = (id: string) => (id in names ? names[id as keyof typeof names] : (REGISTRY_NAMES[id] ?? id));
  return (
    <ReportPanel bar="visibilité — profil" title={m.profileTitle} kind="assumption" intro={m.profileIntro}>
      <div className="rounded-card border border-line p-4">
        <p className="text-xs text-muted-foreground">{m.level}</p>
        {visibility.level ? (
          <p className="mt-1 inline-flex items-center gap-2 font-mono text-lg font-semibold tracking-[-0.04em]" style={{ color: LEVEL_TONE[visibility.level] }}>
            <KindMarker kind="assumption" />
            {m.levels[visibility.level]}
            <span className="text-xs font-normal text-muted-foreground">{t(m.basis, { count: f.int(visibility.basis.length) })}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{m.levelNone}</p>
        )}
      </div>
      {shown.length > 0 && (
        <dl className="mt-4 divide-y divide-line">
          {shown.map((v) => (
            <Fact
              key={`${v.source}-${v.metric}`}
              label={m.metrics[v.metric as keyof typeof m.metrics]}
              value={
                <span className="flex flex-col sm:items-end">
                  {v.value !== null ? (
                    <span className="inline-flex items-center gap-2">
                      <KindMarker kind={NATURE_MARKER[v.nature]} />
                      {indicatorValue(v, f, m.present)}
                    </span>
                  ) : (
                    <span className="font-normal text-muted-foreground">{m.coverage[v.coverage]}</span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">
                    {label(v.source)} · {m.natures[v.nature]}
                    {v.periodEnd ? ` · ${f.day(v.periodEnd)}` : ""}
                  </span>
                </span>
              }
            />
          ))}
        </dl>
      )}
      {failed.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          {failed.map((v) => (
            <li key={v.metric}>{t(m.failedSource, { source: label(v.source), state: m.coverage[v.coverage] })}</li>
          ))}
        </ul>
      )}
      {visibility.notConfigured.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{t(m.notConfigured, { list: visibility.notConfigured.map(label).join(", ") })}</p>}
      {attributions.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{attributions.join(" · ")}</p>}
    </ReportPanel>
  );
}

function TechnologiesPanel({ technologies }: { readonly technologies: Ready["technologies"] }) {
  const m = useMessages("competitorReport").intel;
  return (
    <ReportPanel bar="visibilité — technologies" title={m.techTitle} kind="observed" intro={m.techIntro}>
      {technologies.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.techNone}</p>
      ) : (
        <dl className="divide-y divide-line">
          {TECHNOLOGY_CATEGORIES.filter((c) => technologies.some((tech) => tech.category === c)).map((category) => (
            <Fact
              key={category}
              label={m.categories[category]}
              value={technologies
                .filter((tech) => tech.category === category)
                .map((tech) => tech.name)
                .join(", ")}
            />
          ))}
        </dl>
      )}
    </ReportPanel>
  );
}

function SiteMapPanel({ siteMap }: { readonly siteMap: Ready["siteMap"] }) {
  const m = useMessages("competitorReport").intel;
  const f = useFormat();
  return (
    <ReportPanel bar="visibilité — déclaré" title={m.sitemapTitle} kind="observed" intro={m.sitemapIntro}>
      {siteMap ? (
        <>
          <dl className="divide-y divide-line">
            <Fact label={m.sitemapUrls} value={f.int(siteMap.urls)} />
            <Fact label={m.sitemapProducts} value={f.int(siteMap.productUrls)} />
            <Fact label={m.sitemapLast} value={siteMap.lastModified ? f.day(siteMap.lastModified) : <Insufficient />} />
          </dl>
          {!siteMap.complete && <p className="mt-2 text-xs text-muted-foreground">{m.sitemapPartial}</p>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{m.sitemapNone}</p>
      )}
    </ReportPanel>
  );
}

/** Appended to the visibility tab; each part shows only once the deep check ran. */
export function IntelPanels({ result }: { readonly result: Ready }) {
  return (
    <>
      {result.visibility && <VisibilityProfile visibility={result.visibility} />}
      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <TechnologiesPanel technologies={result.technologies} />
        {result.sources.some((s) => s.id === "sitemap" && s.state !== "skipped") && <SiteMapPanel siteMap={result.siteMap} />}
      </div>
    </>
  );
}

export function HistoryTab({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").intel;
  const f = useFormat();
  const history = result.history;
  const currency = result.observed.currency ?? result.profile?.currency ?? null;
  const money = (v: number | null) => (v === null ? "—" : exactPrice(f, v, currency));
  if (!history || history.readings < 2) {
    return (
      <ReportPanel bar="historique" title={m.historyTitle} kind="observed" intro={m.historyIntro}>
        <p className="text-sm text-muted-foreground">{m.historyEmpty}</p>
      </ReportPanel>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <ReportPanel bar="historique — relevés" title={m.historyTitle} kind="observed" intro={m.historyIntro}>
        {history.firstAt && <p className="mb-4 text-sm">{t(m.historyReadings, { count: f.int(history.readings), date: f.day(history.firstAt) })}</p>}
        <SimpleTable
          columns={[m.series.date, m.series.products, m.series.inStock, m.series.median]}
          rows={[...history.series].reverse().map((p) => ({
            key: p.at,
            cells: [
              <span key="d" className="inline-flex flex-col">
                {f.day(p.at)}
                {!p.complete && <span className="text-xs text-muted-foreground">{m.partialReading}</span>}
              </span>,
              f.int(p.products),
              p.inStockShare === null ? "—" : f.ratioPct(p.inStockShare),
              money(p.medianPrice),
            ],
          }))}
        />
      </ReportPanel>
      <ReportPanel bar="historique — événements" title={m.eventsTitle} kind="observed" intro={m.historyNote}>
        {history.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{m.eventsNone}</p>
        ) : (
          <SimpleTable
            columns={[m.series.date, m.eventsTitle, ""]}
            rows={history.events.map((e, i) => ({
              key: `${e.at}-${e.kind}-${e.handle}-${i}`,
              cells: [
                f.day(e.at),
                <span key="k" className="inline-flex flex-col">
                  {m.events[e.kind]}
                  <span className="text-xs text-muted-foreground">{e.title}</span>
                </span>,
                e.from !== null && e.to !== null ? t(m.priceMove, { from: money(e.from), to: money(e.to) }) : e.variants > 0 ? t(m.variantsMove, { count: f.int(e.variants) }) : "",
              ],
            }))}
          />
        )}
      </ReportPanel>
    </div>
  );
}
