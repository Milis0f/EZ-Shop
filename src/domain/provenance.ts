/**
 * Provenance of every value shown by the app.
 * A value without a SourceRef must never be displayed as data.
 */

export const PROVIDER_IDS = [
  "google-trends",
  "google-ads-keyword-planner",
  "meta-ad-library",
  "tiktok-commercial-content",
  "meta-marketing-api",
  "tiktok-business-api",
  "world-bank",
  "eurostat",
  "oecd",
  // Data sources v2 (2026-10).
  "google-autocomplete",
  "wikimedia",
  "youtube-data",
  "ebay-browse",
  "aliexpress-affiliate",
  "uk-trade-tariff",
  "usitc-hts",
  "vat-rates",
  "ecb-fx",
  "mymemory",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Non-provider origins: values typed by the user or configured assumptions. */
export type SourceId = ProviderId | "user-input" | "assumptions";

/**
 * Physical origin of a value.
 * - live:   fetched from a real external source
 * - mock:   synthetic development fixture — must never reach production
 * - user:   typed by the user (price, cost, translations)
 * - config: default assumption shipped with the app
 */
export type DataOrigin = "live" | "mock" | "user" | "config";

export interface SourcePeriod {
  /** Inclusive start, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly start: string;
  /** Inclusive end, `YYYY-MM` or `YYYY-MM-DD`. */
  readonly end: string;
}

export interface SourceRef {
  readonly sourceId: SourceId;
  readonly origin: DataOrigin;
  /** ISO-8601 timestamp of collection. */
  readonly collectedAt: string;
  readonly connectorVersion: string;
  /** Request identifier — must never contain credentials. */
  readonly queryRef?: string;
  /** Public URL of the source, without credentials. */
  readonly sourceUrl?: string;
  /** Period covered by the observed data. */
  readonly period?: SourcePeriod;
}

const sourceKey = (s: SourceRef): string =>
  [s.sourceId, s.origin, s.queryRef ?? "", s.period?.start ?? "", s.period?.end ?? ""].join("|");

/** Merge source lists without duplicates, preserving first-seen order. */
export function mergeSources(...lists: ReadonlyArray<readonly SourceRef[]>): SourceRef[] {
  const seen = new Map<string, SourceRef>();
  for (const list of lists) {
    for (const source of list) {
      const key = sourceKey(source);
      if (!seen.has(key)) seen.set(key, source);
    }
  }
  return [...seen.values()];
}
