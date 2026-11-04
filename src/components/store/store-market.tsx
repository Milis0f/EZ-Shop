"use client";

import { useState } from "react";
import { PendingButton } from "@/components/motion/pending-button";
import { exactPrice } from "@/components/web/web-visuals";
import type { ProductMarket, StoreMarketResult } from "@/domain/store";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { Panel } from "./store-traffic";

/**
 * The owner's best products next to the same products in other shops. Asked on purpose: it searches
 * the web and reads shops, which takes a minute. Green when the store is cheaper than the median of the
 * sure matches, red when it is more expensive; lookalikes are listed, never counted.
 */

/** Within this share of the median, a price is the same price. */
const SAME = 0.02;

export function StoreMarketView() {
  const m = useMessages("storeBoard").market;
  const f = useFormat();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<StoreMarketResult | null>(null);

  async function run() {
    setPending(true);
    try {
      const response = await fetch("/api/store/market", { method: "POST", cache: "no-store" });
      const body = (await response.json()) as { data?: StoreMarketResult };
      setResult(body.data ?? { ok: false, code: "search_failed" });
    } catch {
      setResult({ ok: false, code: "search_failed" });
    } finally {
      setPending(false);
    }
  }

  const market = result?.ok ? result.market : null;
  return (
    <div className="flex flex-col gap-4">
      <Panel bar="concurrents — prix" title={m.title}>
        <p className="-mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">{m.intro}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PendingButton pending={pending} pendingLabel={m.running} onClick={run} type="button" className="h-10 px-6 text-sm">
            {market ? m.again : m.run}
          </PendingButton>
          {result && !result.ok && (
            <p role="status" className="text-sm text-muted-foreground">
              {m.failures[result.code]}
            </p>
          )}
        </div>
        {pending && <div aria-hidden className="store-wait mt-6" />}
      </Panel>
      {market && !pending && (
        <Panel bar="concurrents — comparaison">
          <ul className="flex flex-col divide-y divide-line">
            {market.products.map((product, i) => (
              <ProductRow key={product.productId} product={product} currency={market.currency} index={i} />
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">
            {m.note} {market.ratesDate && t(m.rates, { date: f.day(market.ratesDate) })}
          </p>
        </Panel>
      )}
    </div>
  );
}

function GapBadge({ gap }: { readonly gap: number }) {
  const m = useMessages("storeBoard").market;
  const f = useFormat();
  if (Math.abs(gap) < SAME) return <span className="store-change store-change-flat">= {m.same}</span>;
  const pct = f.ratioPct(Math.round(Math.abs(gap) * 1000) / 1000);
  return gap < 0 ? (
    <span className="store-change store-change-good">▼ {t(m.cheaper, { pct })}</span>
  ) : (
    <span className="store-change store-change-bad">▲ {t(m.pricier, { pct })}</span>
  );
}

function ProductRow({ product, currency, index }: { readonly product: ProductMarket; readonly currency: string; readonly index: number }) {
  const m = useMessages("storeBoard").market;
  const f = useFormat();
  const money = (v: number, c = currency) => exactPrice(f, v, c);
  return (
    <li className="store-arrive flex flex-col gap-3 py-4 first:pt-0" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="min-w-0 font-medium break-words">{product.title}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span>
            <span className="text-xs text-muted-foreground">{m.columns.yours} </span>
            <span className="tabular font-semibold">{product.price === null ? "—" : money(product.price)}</span>
          </span>
          {product.median !== null && (
            <span>
              <span className="text-xs text-muted-foreground">{m.columns.market} </span>
              <span className="tabular font-semibold">{money(product.median)}</span>
            </span>
          )}
          {product.gap !== null && <GapBadge gap={product.gap} />}
        </div>
      </div>
      {product.state !== "compared" && <p className="text-xs text-muted-foreground">{m.states[product.state as Exclude<typeof product.state, "compared">]}</p>}
      {product.offers.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {product.offers.map((offer) => (
            <li key={offer.url} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-tile bg-[var(--surface-2)]/50 px-3 py-2">
              <a href={offer.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 truncate underline decoration-line underline-offset-4 hover:decoration-foreground">
                {offer.domain}
              </a>
              <span className="flex items-center gap-3 text-xs">
                <span className={offer.match === "uncertain" ? "text-muted-foreground" : ""}>{m.matches[offer.match]}</span>
                <span className="tabular font-semibold">
                  {money(offer.price, offer.currency)}
                  {offer.currency !== currency && offer.converted !== null && <span className="ml-1 font-normal text-muted-foreground">≈ {money(offer.converted)}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
