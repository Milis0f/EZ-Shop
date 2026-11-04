"use client";

import { useState, type ReactNode } from "react";
import { KindMarker } from "@/components/data/kind-marker";
import { TermBar } from "@/components/marketing/term";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { NotProductNotice } from "./competitor-catalogue";
import { estimateNumber, Fact, Insufficient, monthsSince, onlineSince, priceText, ReportPanel, type Ready } from "./competitor-bits";
import { SalesTab, ShopTab, VisibilityTab } from "./competitor-insights";
import { HistoryTab } from "./competitor-intel";
import { ExternalLink, WebReadingBlock, WebSourceList } from "./web-results";
import { exactPrice, SimpleTable, StatGrid, StatTile } from "./web-visuals";

/**
 * The competitor report: a banner naming the shop, the figures that matter, the AI's reading, then one
 * part at a time (product, shop, sales, visibility, suppliers, sources) so nothing piles up.
 */

const TABS = ["product", "shop", "sales", "visibility", "history", "suppliers", "sources"] as const;
type Tab = (typeof TABS)[number];

export function CompetitorReport({ result, onCheck }: { readonly result: Ready; readonly onCheck: (url: string) => void }) {
  const m = useMessages("competitorReport");
  const web = useMessages("web").competitor;
  const [tab, setTab] = useState<Tab>(result.pageKind === "product" ? "product" : "shop");
  const tabs = TABS.filter((value) => value !== "product" || result.pageKind === "product").map((value) => ({ value, label: m.tabs[value] }));

  return (
    <div className="mt-8 flex flex-col gap-4">
      {result.limited && (
        <p role="status" className="panel p-5 text-sm text-muted-foreground sm:p-6">
          {web.limitedNotice}
        </p>
      )}
      <Hero result={result} />
      <KeyFigures result={result} />
      <WebReadingBlock reading={result.reading} badge={web.readingBadge} />
      {result.pageKind === "not_product" && <NotProductNotice links={result.productLinks} hasCatalogue={result.catalogue !== null} onCheck={onCheck} />}
      <div className="-mx-1 mt-2 overflow-x-auto px-1 pb-1">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} aria-label={m.tabsLabel} className="max-w-none" />
      </div>
      {tab === "product" && <ProductTab result={result} />}
      {tab === "shop" && <ShopTab result={result} onCheck={onCheck} />}
      {tab === "sales" && <SalesTab result={result} />}
      {tab === "visibility" && <VisibilityTab result={result} />}
      {tab === "history" && <HistoryTab result={result} />}
      {tab === "suppliers" && <SuppliersTab result={result} />}
      {tab === "sources" && <SourcesTab result={result} />}
    </div>
  );
}

function Hero({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").hero;
  const web = useMessages("web").competitor;
  const f = useFormat();
  const since = onlineSince(result);
  // The moment the report is first shown, once: a render must not read the clock.
  const [shownAt] = useState(() => Date.now());
  const months = since ? monthsSince(since, shownAt) : null;
  const d = result.domainSignals;
  const chips: ReactNode[] = [
    web.platform[result.platform],
    result.profile?.city || result.profile?.country ? [result.profile.city, result.profile.country].filter(Boolean).join(", ") : null,
    months !== null && since ? `${t(m.online, { months: f.int(months) })} · ${t(m.onlineSince, { date: f.day(since) })}` : null,
    result.profile?.productCount ? t(m.products, { count: f.int(result.profile.productCount) }) : null,
    result.profile?.shipsTo.length ? t(m.ships, { count: f.int(result.profile.shipsTo.length) }) : null,
    result.presence?.theme?.schema ? t(m.theme, { name: result.presence.theme.schema }) : null,
    d?.trancoRank ? t(m.tranco, { rank: f.int(d.trancoRank) }) : d?.outsideTranco ? m.noTranco : null,
    t(m.duration, { seconds: f.int(Math.max(1, Math.round(result.durationMs / 1000))) }),
  ].filter(Boolean);

  return (
    <section className="term overflow-hidden" aria-labelledby="competitor-hero">
      <TermBar title={`concurrent — ${result.domain}`} />
      <div className="flex flex-col gap-4 p-5 sm:p-8">
        <div>
          <p className="font-mono text-xs tracking-[-0.02em] text-muted-foreground">
            <ExternalLink href={result.url}>{result.domain}</ExternalLink>
          </p>
          <h2 id="competitor-hero" className="mt-2 font-mono text-[clamp(1.375rem,3vw,2.125rem)] leading-tight font-semibold tracking-[-0.05em] break-words">
            {result.pageKind === "product" && result.observed.name ? result.observed.name : (result.profile?.name ?? result.domain)}
          </h2>
          {result.pageKind === "product" && result.profile?.name && <p className="mt-1 text-sm text-muted-foreground">{result.profile.name}</p>}
        </div>
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <li key={i} className="rounded-pill border border-line px-3 py-1 text-xs text-muted-foreground">
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function KeyFigures({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").kpi;
  const f = useFormat();
  const o = result.observed;
  const checked = result.bestSellers.find((best) => best.checked);
  const estimate = result.estimates.product ?? result.estimates.shop;
  return (
    <section className="term overflow-hidden" aria-label={m.price}>
      <StatGrid className="p-5 sm:p-7">
        {result.pageKind === "product" && <StatTile label={m.price} value={priceText(o, f) ?? <Insufficient />} />}
        {result.pageKind === "product" && <StatTile label={m.reviews} value={o.reviewCount === null ? <Insufficient /> : o.rating === null ? f.int(o.reviewCount) : `${f.int(o.reviewCount)} · ${f.decimal(o.rating)}★`} />}
        {result.pageKind === "product" && result.bestSellers.length > 0 && (
          <StatTile label={m.rank} value={checked ? t(m.rankValue, { rank: f.int(checked.rank), count: f.int(result.bestSellers.length) }) : t(m.notRanked, { count: f.int(result.bestSellers.length) })} />
        )}
        {o.shopReviewCount !== null && <StatTile label={m.shopReviews} value={o.shopRating === null ? f.int(o.shopReviewCount) : `${f.int(o.shopReviewCount)} · ${f.decimal(o.shopRating)}★`} />}
        {result.profile?.productCount != null && <StatTile label={m.products} value={f.int(result.profile.productCount)} />}
        {result.profile && result.profile.shipsTo.length > 0 && <StatTile label={m.countries} value={f.int(result.profile.shipsTo.length)} />}
        <StatTile
          label={m.buyers}
          value={
            estimate ? (
              <span className="inline-flex items-center gap-2">
                <KindMarker kind="estimate" />
                {estimateNumber(estimate.perMonth.p50, f)}
              </span>
            ) : (
              <Insufficient />
            )
          }
          note={estimate ? t(m.buyersNote, { low: estimateNumber(estimate.perMonth.p10, f), high: estimateNumber(estimate.perMonth.p90, f) }) : undefined}
        />
      </StatGrid>
    </section>
  );
}

/** Sizes, colours and their stock, when the shop publishes them. */
function VariantTable({ result }: { readonly result: Ready }) {
  const m = useMessages("web").competitor;
  const f = useFormat();
  const { variantRows, currency } = result.observed;
  if (variantRows.length < 2) return null;
  return (
    <div className="mt-5">
      <SimpleTable
        title={m.variantsTitle}
        columns={[m.variantColumn, m.priceColumn, m.stockColumn]}
        rows={variantRows.map((row, i) => ({
          key: `${row.title}-${i}`,
          cells: [row.title, row.price === null ? "" : exactPrice(f, row.price, currency), row.available === null ? "" : row.available ? m.available : m.soldOut],
        }))}
      />
    </div>
  );
}

function ProductTab({ result }: { readonly result: Ready }) {
  const m = useMessages("web").competitor;
  const f = useFormat();
  const o = result.observed;
  const known = (value: ReactNode | null) => value ?? <Insufficient />;
  return (
    <ReportPanel bar="produit — observé" title={m.observedTitle} kind="observed" intro={`${t(m.observedIntro, { domain: result.domain })} ${m.platform[result.platform]}.`}>
      <dl className="divide-y divide-line">
        <Fact label={m.fields.name} value={known(o.name)} />
        <Fact label={m.fields.vendor} value={known(o.vendor)} />
        <Fact label={m.fields.price} value={known(priceText(o, f))} />
        {o.compareAtPrice !== null && <Fact label={m.compareAt} value={exactPrice(f, o.compareAtPrice, o.currency)} />}
        {o.productType && <Fact label={m.productType} value={o.productType} />}
        <Fact label={m.fields.variants} value={known(o.variants === null ? null : f.int(o.variants))} />
        <Fact label={m.fields.inStock} value={known(o.variantsInStock === null ? null : f.int(o.variantsInStock))} />
        <Fact label={m.fields.published} value={known(o.publishedAt && !Number.isNaN(Date.parse(o.publishedAt)) ? f.day(o.publishedAt) : null)} />
        <Fact label={m.fields.reviews} value={known(o.reviewCount === null ? null : f.int(o.reviewCount))} />
        <Fact label={m.fields.rating} value={known(o.rating === null ? null : f.decimal(o.rating))} />
        {o.shopReviewCount !== null && (
          <Fact label={m.shopReviews} value={o.shopRating === null ? f.int(o.shopReviewCount) : t(m.shopReviewsValue, { count: f.int(o.shopReviewCount), rating: f.decimal(o.shopRating) })} />
        )}
        <Fact label={m.fields.delivery} value={known(o.deliveryText)} />
        <Fact label={m.fields.apps} value={result.apps.length ? result.apps.join(", ") : m.none} />
      </dl>
      <VariantTable result={result} />
    </ReportPanel>
  );
}

function SupplierBlock({ result }: { readonly result: Ready }) {
  const web = useMessages("web");
  const m = web.competitor;
  if (result.supplierSearch === "not_asked") return <p className="mt-1 text-sm text-muted-foreground">{m.suppliersNotAsked}</p>;
  if (result.supplierSearch !== "done") {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{web.results.failures[result.supplierSearch]}</p>
        {result.supplierSearch === "search_not_installed" && <code className="self-start rounded-pill bg-surface-2 px-4 py-1.5 text-sm">npm run search:setup</code>}
      </div>
    );
  }
  if (!result.suppliers?.length) return <p className="mt-1 text-sm text-muted-foreground">{m.suppliersEmpty}</p>;
  return <WebSourceList sources={result.suppliers} />;
}

function SuppliersTab({ result }: { readonly result: Ready }) {
  const m = useMessages("web").competitor;
  const o = result.observed;
  const lensUrl = o.image ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(o.image)}` : null;
  return (
    <div className="flex flex-col gap-4">
      <ReportPanel bar="fournisseurs — hypothèses" title={m.hypothesesTitle} kind="assumption" intro={m.hypothesesIntro}>
        {result.signals.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {result.signals.map((signal) => (
              <li key={signal}>{m.signals[signal]}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{m.noSignal}</p>
        )}
      </ReportPanel>
      <ReportPanel bar="fournisseurs — marketplaces" title={m.suppliersTitle} kind="assumption">
        <SupplierBlock result={result} />
        <h4 className="mt-6 text-sm font-medium">{m.checkYourself}</h4>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {o.name && (
            <li>
              <ExternalLink href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(o.name)}`}>{m.searchAliexpress}</ExternalLink>
            </li>
          )}
          {lensUrl && (
            <li>
              <ExternalLink href={lensUrl}>{m.lens}</ExternalLink>
            </li>
          )}
        </ul>
      </ReportPanel>
    </div>
  );
}

const STATE_TONE: Readonly<Record<Ready["sources"][number]["state"], string>> = {
  read: "var(--verdict-oui)",
  partial: "var(--verdict-surveiller)",
  limited: "var(--verdict-surveiller)",
  refused: "var(--verdict-non)",
  absent: "var(--ink-muted)",
  skipped: "var(--ink-muted)",
};

function SourcesTab({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").sources;
  return (
    <ReportPanel bar="sources" title={m.title} intro={m.intro}>
      <ul className="divide-y divide-line">
        {result.sources.map((source) => (
          <li key={source.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5 text-sm">
            <span>{m.names[source.id]}</span>
            <span className="inline-flex items-center gap-2 font-mono text-xs tracking-[-0.02em]" style={{ color: STATE_TONE[source.state] }}>
              <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: STATE_TONE[source.state] }} />
              {m.states[source.state]}
            </span>
          </li>
        ))}
      </ul>
    </ReportPanel>
  );
}
