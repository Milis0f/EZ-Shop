"use client";

import { AiAura } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { KindMarker } from "@/components/data/kind-marker";
import type { WebPagePrice, WebPriceSummary, WebReading, WebSource, WebSummary } from "@/domain/web";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { BarList, exactPrice, SimpleTable, StatGrid, StatTile } from "./web-visuals";
import "./web-visuals.css";

/** Only http(s) links are ever rendered: addresses come from the web. */
export const safeHref = (url: string): string | undefined => (/^https?:\/\//i.test(url) ? url : undefined);

export function ExternalLink({ href, children }: { readonly href: string; readonly children: React.ReactNode }) {
  const m = useMessages("web").results;
  const safe = safeHref(href);
  if (!safe) return <span>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" title={m.openLink} className="underline decoration-line underline-offset-4 transition-colors duration-(--dur-fast) hover:decoration-foreground">
      {children}
    </a>
  );
}

/** The page a figure was read on, as a link. */
function SourceLink({ source, sources }: { readonly source: number; readonly sources: readonly WebSource[] }) {
  const m = useMessages("web").results;
  const page = sources[source - 1];
  const label = t(m.source, { n: source });
  return page ? <ExternalLink href={page.url}>{label}</ExternalLink> : <span>{label}</span>;
}

function AiFigures({ summary, sources }: { readonly summary: WebSummary; readonly sources: readonly WebSource[] }) {
  const f = useFormat();
  const table = summary.tables[0];
  const chart = summary.charts[0];
  return (
    <>
      {summary.stats.length > 0 && (
        <StatGrid className="mt-5">
          {summary.stats.map((stat) => (
            <StatTile key={`${stat.label}-${stat.source}`} label={stat.label} value={stat.value} note={<SourceLink source={stat.source} sources={sources} />} />
          ))}
        </StatGrid>
      )}
      {chart && (
        <div className="mt-6">
          <BarList
            title={chart.title}
            bars={chart.points.map((point) => ({
              key: `${point.label}-${point.source}`,
              label: (
                <>
                  {point.label} (<SourceLink source={point.source} sources={sources} />)
                </>
              ),
              value: point.value,
              display: `${f.number(point.value, { minimumFractionDigits: /[€$£]/.test(chart.unit) && !Number.isInteger(point.value) ? 2 : 0, maximumFractionDigits: 2 })}${chart.unit ? ` ${chart.unit}` : ""}`,
            }))}
          />
        </div>
      )}
      {table && (
        <div className="mt-6">
          <SimpleTable
            title={table.title}
            columns={[...table.columns, ""]}
            rows={table.rows.map((row, i) => ({ key: String(i), cells: [...row.cells, <SourceLink key="source" source={row.source} sources={sources} />] }))}
          />
        </div>
      )}
    </>
  );
}

/** What the AI wrote from web material, inside the aura; when there is nothing, it says why. */
export function WebReadingBlock({ reading, badge, sources = [] }: { readonly reading: WebReading; readonly badge: string; readonly sources?: readonly WebSource[] }) {
  const m = useMessages("web").results;
  if (!reading.summary) {
    if (!reading.note) return null;
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">{m.aiNotes[reading.note]}</p>
        {reading.note === "ai_missing" && <AiInstallButton />}
      </div>
    );
  }
  return (
    <AiAura state="ready" surfaceClassName="p-5 sm:p-6">
      <AiBadge label={badge} state="ready" />
      {reading.summary.summary && <p className="mt-4 text-base leading-relaxed text-pretty">{reading.summary.summary}</p>}
      <AiFigures summary={reading.summary} sources={sources} />
      {reading.summary.keyPoints.length > 0 && (
        <>
          <h4 className="mt-5 text-sm font-medium">{m.keyPoints}</h4>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {reading.summary.keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </>
      )}
    </AiAura>
  );
}

/** Prices the pages state themselves. Read without the AI, so they appear with or without it. */
export function WebPrices({ prices, summary }: { readonly prices: readonly WebPagePrice[]; readonly summary: WebPriceSummary | null }) {
  const m = useMessages("web").results;
  const f = useFormat();
  if (prices.length === 0) return null;
  // Only one currency on a scale: comparing euros with dollars by length would mislead.
  const currency = summary?.currency ?? prices[0]?.currency ?? null;
  const comparable = prices.filter((price) => price.currency === currency);
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-medium">
          <KindMarker kind="observed" />
          {m.pricesTitle}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">{m.pricesIntro}</p>
      </div>
      {summary && (
        <StatGrid className="sm:grid-cols-3">
          <StatTile label={m.priceLow} value={exactPrice(f, summary.min, summary.currency)} />
          <StatTile label={m.priceMedian} value={exactPrice(f, summary.median, summary.currency)} note={t(m.calculated, { count: f.int(summary.count) })} />
          <StatTile label={m.priceHigh} value={exactPrice(f, summary.max, summary.currency)} />
        </StatGrid>
      )}
      <BarList
        bars={comparable.map((price) => ({
          key: price.url,
          label: (
            <>
              <ExternalLink href={price.url}>{price.domain}</ExternalLink> {price.name}
              {price.rating !== null && ` · ${t(m.rating, { rating: f.decimal(price.rating) })}`}
              {price.reviewCount !== null && ` · ${t(m.reviews, { count: f.int(price.reviewCount) })}`}
            </>
          ),
          value: price.price,
          display: exactPrice(f, price.price, price.currency),
        }))}
      />
    </section>
  );
}

export function WebSourceList({ sources }: { readonly sources: readonly WebSource[] }) {
  const m = useMessages("web").results;
  return (
    <ul className="divide-y divide-line">
      {sources.map((source) => (
        <li key={source.url} className="py-3">
          <p className="text-sm font-medium break-words">
            <ExternalLink href={source.url}>{source.title || source.url}</ExternalLink>
          </p>
          {source.snippet && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{source.snippet}</p>}
          <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <KindMarker kind={source.read ? "observed" : "assumption"} />
            {source.read ? m.pageRead : m.snippetOnly}
          </p>
        </li>
      ))}
    </ul>
  );
}
