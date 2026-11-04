import type { MarketOffer, ProductMarket } from "@/domain/store";
import { allowsPriceComparison } from "@/engine/competitor/entity-match";

/**
 * The arithmetic of a price comparison: conversion at a reference rate, median of the offers that are
 * surely the same product, and the gap of the store's price to it. Lookalikes are shown, never counted.
 */

/** Amount in `from` → amount in `to`, with EUR-based reference rates (1 EUR = rates[X] X). */
export function convert(amount: number, from: string, to: string, rates: Readonly<Record<string, number>> | null): number | null {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b) return amount;
  if (!rates) return null;
  const rate = (code: string) => (code === "EUR" ? 1 : rates[code]);
  const ra = rate(a);
  const rb = rate(b);
  if (!ra || !rb || !Number.isFinite(ra) || !Number.isFinite(rb)) return null;
  return Math.round((amount / ra) * rb * 100) / 100;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

export function marketOf(productId: string, title: string, price: number | null, offers: readonly MarketOffer[], searched: boolean): ProductMarket {
  const comparable = offers.filter((o) => allowsPriceComparison(o.match) && o.converted !== null).map((o) => o.converted as number);
  const mid = median(comparable);
  const gap = price !== null && mid !== null && mid > 0 ? Math.round((price / mid - 1) * 1000) / 1000 : null;
  const state: ProductMarket["state"] = !searched
    ? "search_failed"
    : price === null
      ? "no_price"
      : comparable.length > 0
        ? "compared"
        : offers.length > 0
          ? "lookalikes_only"
          : "nothing_found";
  return { productId, title, price, offers: [...offers], median: mid, gap, state };
}
