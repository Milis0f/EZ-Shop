"use client";

import { Fragment } from "react";
import { AiAura, aiRevealClassName } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { KindMarker } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { countryName } from "@/components/search/display-names";
import { TrendChart } from "@/components/store/store-charts";
import { regionName } from "@/components/store/store-format";
import { ExternalLink } from "@/components/web/web-results";
import { BarList, exactPrice, SimpleTable, StatGrid, StatTile } from "@/components/web/web-visuals";
import type { CountryCode } from "@/domain/country";
import { DEEP_SECTIONS, type DeepReport, type DeepSource } from "@/domain/deep-research";
import { useFormat, useLocale, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";

/**
 * The deep AI research's report. Figures come from the pages (prices) or are calculations (margin);
 * the AI's text sits in its aura, each point followed by the numbers of its sources, which open them.
 */

const stagger = (order: number) => ({ "--stagger": order }) as React.CSSProperties;

function Cite({ numbers, sources }: { readonly numbers: readonly number[]; readonly sources: readonly DeepSource[] }) {
  return (
    <span className="ml-1 inline-flex gap-1 align-super text-[11px]">
      {numbers.map((n) => {
        const source = sources[n - 1];
        return source ? (
          <a key={n} href={source.url} target="_blank" rel="noopener noreferrer" title={`${source.title} — ${source.domain}`} className="rounded-pill border border-line px-1.5 font-mono text-muted-foreground no-underline hover:border-foreground hover:text-foreground">
            {n}
          </a>
        ) : null;
      })}
    </span>
  );
}

function Panel({ bar, title, kind, intro, children }: { readonly bar: string; readonly title: string; readonly kind?: "observed" | "derived" | "assumption"; readonly intro?: string; readonly children: React.ReactNode }) {
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

export function DeepReportView({ report }: { readonly report: DeepReport }) {
  const m = useMessages("deepResearch").report;
  const f = useFormat();
  const locale = useLocale();
  const s = report.sources;
  const currency = report.priceSummary?.currency ?? report.prices[0]?.currency ?? null;
  const money = (value: number) => exactPrice(f, value, currency);
  const read = s.filter((source) => source.read).length;
  const countryLabel = countryName(report.country as CountryCode, locale);
  const yourPrice = report.margin?.sellingPrice ?? null;
  const priceBars = [
    ...report.prices.map((p) => ({
      key: `p-${p.source}`,
      label: (
        <span>
          <ExternalLink href={s[p.source - 1]?.url ?? "#"}>{s[p.source - 1]?.domain ?? p.name}</ExternalLink>
          <span className="text-muted-foreground"> · {p.name.slice(0, 60)}</span>
        </span>
      ),
      value: p.price,
      display: exactPrice(f, p.price, p.currency),
    })),
    ...(yourPrice !== null ? [{ key: "yours", label: <span className="font-semibold text-foreground">{m.yourPrice}</span>, value: yourPrice, display: money(yourPrice) }] : []),
  ].sort((a, b) => a.value - b.value);

  return (
    <div className="mt-10 flex flex-col gap-4">
      <section className="term overflow-hidden">
        <TermBar title={t(m.bar, { product: report.product })} />
        <div className="flex flex-col gap-5 p-5 sm:p-8">
          <div>
            <h2 className="font-mono text-[clamp(1.375rem,3vw,2.125rem)] leading-tight font-semibold tracking-[-0.05em] break-words">{report.product}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(m.meta, { country: countryLabel, sources: f.int(s.length), seconds: f.int(Math.round(report.durationMs / 1000)) })}
              {report.model ? ` · ${t(m.model, { model: report.model })}` : ""}
            </p>
          </div>
          {report.cutShort && <p className="rounded-tile border border-[var(--verdict-surveiller)] px-4 py-3 text-sm text-muted-foreground">{m.cutShort}</p>}
          <StatGrid>
            <StatTile label={m.kpi.median} value={report.priceSummary ? money(report.priceSummary.median) : "—"} />
            <StatTile label={m.kpi.range} value={report.priceSummary ? `${money(report.priceSummary.min)} – ${money(report.priceSummary.max)}` : "—"} />
            <StatTile label={m.kpi.competitors} value={f.int(report.shops.length)} />
            <StatTile label={m.kpi.suppliers} value={f.int(report.suppliers.length)} />
            {report.margin && <StatTile label={m.kpi.margin} value={`${money(report.margin.margin)} · ${f.pct(report.margin.marginPct)}`} />}
            <StatTile label={m.kpi.read} value={f.int(read)} />
          </StatGrid>
        </div>
      </section>

      {report.ai ? (
        <AiAura state="ready" surfaceClassName="flex flex-col gap-7 p-5 sm:p-8">
          <AiBadge label={m.aiBadge} state="ready" />
          {report.ai.summary && (
            <p style={stagger(0)} className={cn(aiRevealClassName, "max-w-3xl font-display text-xl leading-snug tracking-[-0.02em] sm:text-2xl")}>
              {report.ai.summary}
            </p>
          )}
          <div style={stagger(1)} className={cn(aiRevealClassName, "grid gap-6 min-[900px]:grid-cols-2")}>
            {DEEP_SECTIONS.map((id) => {
              const section = report.ai?.sections.find((x) => x.id === id);
              if (!section) return null;
              return (
                <section key={id}>
                  <h3 className="mb-2.5 text-sm font-medium">{m.sections[id]}</h3>
                  <ul className="flex flex-col gap-2 text-sm leading-relaxed">
                    {section.points.map((point, i) => (
                      <li key={i} className="flex gap-3">
                        <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--ink-muted)]" />
                        <span>
                          {point.text}
                          <Cite numbers={point.sources} sources={s} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {report.ai.actions.length > 0 && (
            <section style={stagger(2)} className={aiRevealClassName}>
              <h3 className="mb-3 text-sm font-medium">{m.actions}</h3>
              <ol className="grid gap-3 min-[900px]:grid-cols-2">
                {report.ai.actions.map((action, i) => (
                  <li key={i} className="flex flex-col gap-1.5 rounded-tile border border-line bg-[var(--surface-2)] p-4">
                    <p className="font-medium leading-snug">{action.title}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {action.why}
                      <Cite numbers={action.sources} sources={s} />
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </AiAura>
      ) : (
        report.aiNote && <p className="panel p-5 text-sm text-muted-foreground sm:p-6">{m.notes[report.aiNote]}</p>
      )}

      <div className="grid gap-4 min-[1100px]:grid-cols-2">
        {priceBars.length > 1 && (
          <Panel bar="analyse ia — prix" title={m.pricesTitle} kind="observed" intro={m.pricesIntro}>
            <BarList bars={priceBars} />
          </Panel>
        )}
        {report.margin && (
          <Panel bar="analyse ia — marge" title={m.marginTitle} kind="derived" intro={m.marginIntro}>
            <TrendChart
              title={m.marginTitle}
              days={report.margin.byPrice.map((point) => String(point.price))}
              series={[{ key: "margin", label: m.marginSeries, values: report.margin.byPrice.map((point) => point.marginPct), slot: 3 }]}
              formatValue={(v) => f.pct(Math.round(v))}
              formatDay={(price) => money(Number(price))}
              tableLabel={m.tableView}
              dayLabel={m.priceLabel}
            />
          </Panel>
        )}
      </div>

      {report.shops.length > 0 && (
        <Panel bar="analyse ia — boutiques" title={m.shopsTitle} kind="observed">
          <SimpleTable
            columns={[m.shopsColumns.shop, m.shopsColumns.country, m.shopsColumns.products, m.shopsColumns.match, m.shopsColumns.price, m.shopsColumns.compareAt]}
            rows={report.shops.map((shop) => ({
              key: shop.domain,
              cells: [
                <ExternalLink key="d" href={s[shop.source - 1]?.url ?? `https://${shop.domain}`}>
                  {shop.name ?? shop.domain}
                </ExternalLink>,
                shop.country ? regionName(shop.country, f.locale, shop.country) : "—",
                shop.productCount === null ? "—" : f.int(shop.productCount),
                shop.match ? (
                  <ExternalLink key="p" href={shop.match.url}>
                    {shop.match.title}
                  </ExternalLink>
                ) : (
                  m.noMatch
                ),
                shop.match?.price != null ? money(shop.match.price) : "—",
                shop.match?.compareAt != null ? money(shop.match.compareAt) : "—",
              ],
            }))}
          />
        </Panel>
      )}

      {report.suppliers.length > 0 && (
        <Panel bar="analyse ia — fournisseurs" title={m.suppliersTitle} kind="assumption" intro={m.suppliersIntro}>
          <ul className="flex flex-col gap-2 text-sm">
            {report.suppliers.map((n) => {
              const source = s[n - 1];
              return source ? (
                <li key={n}>
                  <ExternalLink href={source.url}>{source.title}</ExternalLink>
                  <span className="text-muted-foreground"> · {source.domain}</span>
                </li>
              ) : null;
            })}
          </ul>
        </Panel>
      )}

      {report.toolCalls.length > 0 && (
        <Panel bar="analyse ia — outils" title={m.toolsTitle}>
          <ol className="flex flex-col gap-1.5 font-mono text-xs tracking-[-0.02em]">
            {report.toolCalls.map((call, i) => (
              <li key={i} className={call.ok ? "" : "text-muted-foreground"}>
                {i + 1}. {(m.tools as Readonly<Record<string, string>>)[call.tool] ?? call.tool} {call.tool === "compute_margin" ? "" : `« ${call.input} »`}
                {!call.ok && ` — ${m.toolFailed}`}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel bar="analyse ia — sources" title={m.sourcesTitle}>
        <ol className="flex flex-col gap-2 text-sm">
          {s.map((source) => (
            <li key={source.n} id={`source-${source.n}`} className="flex gap-3">
              <span className="w-7 shrink-0 text-right font-mono text-xs text-muted-foreground">{source.n}</span>
              <span className="min-w-0">
                <ExternalLink href={source.url}>{source.title}</ExternalLink>
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {source.domain} · {m.sourceKinds[source.kind]}
                  {source.byAi && (
                    <Fragment>
                      {" "}
                      · {m.byAi}
                    </Fragment>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
