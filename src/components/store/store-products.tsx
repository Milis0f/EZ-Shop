"use client";

import { useActionState, useMemo, useState } from "react";
import { submitAnalysis } from "@/app/actions";
import { INITIAL_SEARCH_STATE } from "@/app/search-form-state";
import { TermBar } from "@/components/marketing/term";
import { PendingButton } from "@/components/motion/pending-button";
import { usePlanetAnalysis } from "@/components/planet/planet-hooks";
import { inputLanguageFor } from "@/components/search/display-names";
import { Button } from "@/components/ui/button";
import { WebResearchResult } from "@/components/web/web-research";
import { runWebResearch, useWebResearch } from "@/components/web/web-research-store";
import { exactPrice } from "@/components/web/web-visuals";
import type { CountryCode } from "@/domain/country";
import type { ProductSales, StoreSummary } from "@/domain/store";
import { useFormat, useLocale, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { regionName, shortList } from "./store-format";

/** Within this share of the median, a price is "in line". */
const SAME_PRICE = 0.05;

export function StoreProducts({ summary, taxesIncluded, analysisCountries }: { readonly summary: StoreSummary; readonly taxesIncluded: boolean | null; readonly analysisCountries: readonly CountryCode[] }) {
  const m = useMessages("store");
  if (summary.products.length === 0) return <p className="panel p-5 text-sm text-muted-foreground sm:p-6">{m.noProducts}</p>;
  return (
    <section className="term overflow-hidden">
      <TermBar title={`produits — ${summary.products.length}`} />
      <ul className="divide-y divide-line">
        {summary.products.map((product) => (
          <ProductRow key={product.id} product={product} currency={summary.currency} taxesIncluded={taxesIncluded} analysisCountries={analysisCountries} />
        ))}
      </ul>
    </section>
  );
}

function ProductRow({ product, currency, taxesIncluded, analysisCountries }: { readonly product: ProductSales; readonly currency: string; readonly taxesIncluded: boolean | null; readonly analysisCountries: readonly CountryCode[] }) {
  const m = useMessages("store");
  const f = useFormat();
  const [comparing, setComparing] = useState(false);
  const c = m.products.columns;
  const price = product.priceMin === null ? "—" : product.priceMax !== null && product.priceMax !== product.priceMin ? `${exactPrice(f, product.priceMin, currency)} – ${exactPrice(f, product.priceMax, currency)}` : exactPrice(f, product.priceMin, currency);
  const status = m.products.status[product.status as keyof typeof m.products.status] ?? product.status;

  function compare() {
    if (!comparing) void runWebResearch(product.title);
    setComparing((open) => !open);
  }

  return (
    <li className="px-5 py-4 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[0.9375rem] font-semibold tracking-[-0.03em] break-words">{product.title}</p>
          <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>{c.price}</dt>
              <dd className="tabular text-foreground">{price}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{c.stock}</dt>
              <dd className="tabular text-foreground">{product.inventory === null ? m.products.notTracked : f.int(product.inventory)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{c.sold}</dt>
              <dd className="tabular text-foreground">{f.int(product.units)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{c.revenue}</dt>
              <dd className="tabular text-foreground">{exactPrice(f, product.revenue, currency)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{c.status}</dt>
              <dd className="text-foreground">{status}</dd>
            </div>
          </dl>
          {product.countries.length > 0 && <p className="mt-1.5 text-xs text-muted-foreground">{t(m.products.soldIn, { list: shortList(product.countries.map((code) => regionName(code, f.locale, code))) })}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={comparing} onClick={compare}>
            {comparing ? m.products.hideCompare : m.products.compare}
          </Button>
          <AnalyseProduct product={product} currency={currency} taxesIncluded={taxesIncluded} countries={analysisCountries} />
        </div>
      </div>
      {comparing && (
        <div className="mt-4 flex flex-col gap-4 rounded-tile border border-line bg-background/40 p-4 sm:p-5">
          <PriceGap product={product} currency={currency} />
          <WebResearchResult query={product.title} />
        </div>
      )}
    </li>
  );
}

/** The store's price against the prices other pages declare for the same words: a fact of each page, compared. */
function PriceGap({ product, currency }: { readonly product: ProductSales; readonly currency: string }) {
  const m = useMessages("store").products;
  const f = useFormat();
  const view = useWebResearch(product.title);
  if (view.kind !== "done" || view.response.status !== "ready" || product.priceMin === null) return null;
  const summary = view.response.priceSummary;
  const yours = t(m.yourPrice, { price: exactPrice(f, product.priceMin, currency) });
  let line: string;
  if (!summary) line = m.gapNone;
  else if (summary.currency !== currency) line = t(m.gapCurrency, { currency: summary.currency });
  else {
    const gap = (product.priceMin - summary.median) / summary.median;
    const values = { gap: f.pct(Math.round(Math.abs(gap) * 100)), median: exactPrice(f, summary.median, summary.currency), count: f.int(summary.count) };
    line = Math.abs(gap) <= SAME_PRICE ? t(m.gapSame, values) : t(gap > 0 ? m.gapAbove : m.gapBelow, values);
  }
  return (
    <p className="font-mono text-sm tracking-[-0.02em]">
      <span className="text-foreground">{yours}</span> <span className="text-muted-foreground">{line}</span>
    </p>
  );
}

/**
 * Runs the pre-launch analysis of a store product in the countries the store ships to. The store's
 * price goes along only when it is a price before VAT, as the analysis expects.
 */
function AnalyseProduct({ product, currency, taxesIncluded, countries }: { readonly product: ProductSales; readonly currency: string; readonly taxesIncluded: boolean | null; readonly countries: readonly CountryCode[] }) {
  const m = useMessages("store").products;
  const locale = useLocale();
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL_SEARCH_STATE);
  const targets = useMemo<readonly CountryCode[]>(() => (countries.length ? countries : ["FR"]), [countries]);
  const sent = useMemo(() => ({ product: product.title, countries: targets }), [product.title, targets]);
  const message = t(m.analyseHint, { name: product.title, count: String(targets.length) });
  usePlanetAnalysis(pending, sent, message);
  const priceBeforeVat = taxesIncluded === false && currency === "EUR" && product.priceMin !== null ? product.priceMin : null;
  const notes = [countries.length ? null : m.analyseNoCountry, priceBeforeVat === null && taxesIncluded ? m.analyseTaxesIncluded : null].filter(Boolean).join(" ");

  return (
    <form action={action} title={`${message}${notes ? ` ${notes}` : ""}`}>
      <input type="hidden" name="productName" value={product.title} />
      <input type="hidden" name="inputLanguage" value={inputLanguageFor(locale)} />
      {targets.map((code) => (
        <input key={code} type="hidden" name="countries" value={code} />
      ))}
      {priceBeforeVat !== null && <input type="hidden" name="sellingPrice" value={String(priceBeforeVat)} />}
      <PendingButton pending={pending} pendingLabel={m.analysePending} className="h-9 px-4 text-sm">
        {m.analyse}
      </PendingButton>
      {state.error && (
        <p role="alert" className="mt-2 max-w-xs text-xs text-[var(--verdict-non)]">
          {state.error}
        </p>
      )}
    </form>
  );
}
