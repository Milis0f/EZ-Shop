import type { CollectionIssue } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { insufficient, observed, type Datum, type Unit } from "@/domain/datum";
import type { ProductQuery } from "@/domain/product";
import { mergeSources, type ProviderId, type SourceRef } from "@/domain/provenance";
import { addMonths, lastCompleteMonth } from "@/domain/time";
import type { CountrySignals } from "@/engine/analyze-country";
import type { MacroSignals } from "@/engine/market/context";
import { termsForCountry } from "@/engine/terms/expand";
import { regimeOf } from "@/engine/taxes/import-taxes";
import type {
  ContentObservation,
  DataProvider,
  ListingsObservation,
  MacroObservation,
  ProviderResult,
  SuggestionsObservation,
  TopicInterestObservation,
} from "@/providers/contracts";
import type { ProviderSet } from "@/providers/registry";
import type { GlobalSignals } from "./collect-global";

const KEYWORD_HISTORY_MONTHS = 48;
const TRENDS_HISTORY_MONTHS = 60;
const AD_LOOKBACK_DAYS = 182;
const TOPIC_HISTORY_MONTHS = 36;
const CONTENT_LOOKBACK_DAYS = 365;

/** Wikipedia interest depends on the language only: one request per language and analysis. */
export type TopicMemo = Map<string, Promise<ProviderResult<TopicInterestObservation>>>;
const COUNTRY_CONCURRENCY = 6;

export interface CollectedMacro {
  readonly byCountry: ReadonlyMap<CountryCode, MacroSignals>;
  readonly observations: readonly MacroObservation[];
  readonly issues: readonly CollectionIssue[];
}

/** Convert a provider result into a Datum; failures become explicit DATA_INSUFFICIENT + issue. */
function toDatum<T>(
  provider: DataProvider,
  result: ProviderResult<T>,
  unit: Unit,
  sourcesOf: (data: T) => readonly SourceRef[],
  issues: CollectionIssue[],
): Datum<T> {
  if (result.ok) return observed(result.data, unit, mergeSources(sourcesOf(result.data)));
  issues.push({ providerId: provider.meta.id, code: result.error.code, message: result.error.message });
  return insufficient(result.error.message, [provider.meta.id]);
}

export async function collectMacro(set: ProviderSet, countries: readonly CountryCode[]): Promise<CollectedMacro> {
  const results = await Promise.all(set.macro.map(async (p) => ({ provider: p, result: await p.getIndicators(countries) })));
  const byCountry = new Map<CountryCode, Partial<Record<string, Datum<number>>>>();
  const observations: MacroObservation[] = [];
  const issues: CollectionIssue[] = [];

  for (const { provider, result } of results) {
    if (!result.ok) {
      issues.push({ providerId: provider.meta.id, code: result.error.code, message: result.error.message });
      continue;
    }
    for (const e of result.data.partialErrors) issues.push({ providerId: provider.meta.id, code: e.code, message: e.message });
    for (const o of result.data.observations) {
      observations.push(o);
      const current = byCountry.get(o.country) ?? {};
      byCountry.set(o.country, { ...current, [o.indicator]: observed(o.value, unitOf(o.indicator), [o.source]) });
    }
  }
  return { byCountry: byCountry as ReadonlyMap<CountryCode, MacroSignals>, observations, issues };
}

function unitOf(indicator: MacroObservation["indicator"]): Unit {
  if (indicator === "population") return "people";
  if (indicator === "gdp_per_capita_ppp") return "money_per_capita_ppp";
  if (indicator === "consumer_confidence") return "index_0_100";
  return "percent";
}

export async function collectCountry(
  set: ProviderSet,
  product: ProductQuery,
  country: CountryCode,
  macro: CollectedMacro,
  global: GlobalSignals,
  topicMemo: TopicMemo,
  now: Date,
): Promise<CountrySignals> {
  // Batch-wide issues: attach them to every country so each analysis is self-explanatory.
  const issues: CollectionIssue[] = [...macro.issues, ...global.issues];
  const { queryTerms, language, languageMismatch } = termsForCountry(product, country);
  const terms = queryTerms.map((t) => t.term);
  const to = lastCompleteMonth(now);
  const since = new Date(now.getTime() - AD_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

  const wikidataId = global.topicEntity?.wikidataId;
  const topicKey = `${language}|${wikidataId ?? terms.join("|")}`;
  if (!topicMemo.has(topicKey)) {
    topicMemo.set(topicKey, set.topicInterest.getTopicInterest({ terms, language, wikidataId, from: addMonths(to, -(TOPIC_HISTORY_MONTHS - 1)), to }));
  }
  const countryQuery = { terms, country, language };
  // Terms in another language than the country's say nothing about local searches or listings: not queried.
  const untranslated = <T>(): Promise<ProviderResult<T>> =>
    Promise.resolve({ ok: false, error: { code: "no_data", message: `Terme non traduit dans la langue du pays : ajoute une ligne « ${language}: … »`, retryable: false } });
  const [suggestions, content, listings, topic] = await Promise.all([
    languageMismatch ? untranslated<SuggestionsObservation>() : set.suggest.getSuggestions(countryQuery),
    languageMismatch
      ? untranslated<ContentObservation>()
      : set.content.getContent({ ...countryQuery, publishedAfter: new Date(now.getTime() - CONTENT_LOOKBACK_DAYS * 86_400_000).toISOString() }),
    languageMismatch ? untranslated<ListingsObservation>() : set.marketplace.getListings(countryQuery),
    topicMemo.get(topicKey) as Promise<ProviderResult<TopicInterestObservation>>,
  ]);

  const [kp, trends, metaAds, tiktokAds, metaCost, tiktokCost] = await Promise.all([
    set.keywordMetrics.getKeywordMetrics({ terms, country, language, from: addMonths(to, -(KEYWORD_HISTORY_MONTHS - 1)), to }),
    set.searchInterest.getInterestOverTime({ terms, country, from: addMonths(to, -(TRENDS_HISTORY_MONTHS - 1)), to }),
    byPlatform(set.adLibraries, "meta").getAdActivity({ terms, country, since }),
    byPlatform(set.adLibraries, "tiktok").getAdActivity({ terms, country, since }),
    byPlatform(set.adCosts, "meta").getCostEstimate({ terms, country }),
    byPlatform(set.adCosts, "tiktok").getCostEstimate({ terms, country }),
  ]);

  return {
    country,
    terms: queryTerms,
    languageMismatch,
    keywordMetrics: toDatum(set.keywordMetrics, kp, "searches_per_month", (d) => d.map((m) => m.source), issues),
    searchInterest: toDatum(set.searchInterest, trends, "index_0_100", (d) => d.map((s) => s.source), issues),
    adActivity: {
      meta: toDatum(byPlatform(set.adLibraries, "meta"), metaAds, "count", (d) => [d.source], issues),
      tiktok: toDatum(byPlatform(set.adLibraries, "tiktok"), tiktokAds, "count", (d) => [d.source], issues),
    },
    adCosts: {
      meta: toDatum(byPlatform(set.adCosts, "meta"), metaCost, "money", (d) => [d.source], issues),
      tiktok: toDatum(byPlatform(set.adCosts, "tiktok"), tiktokCost, "money", (d) => [d.source], issues),
    },
    macro: macro.byCountry.get(country) ?? {},
    language,
    v2: {
      suggestions: toDatum(set.suggest, suggestions, "count", (d) => [d.source], issues),
      content: toDatum(set.content, content, "count", (d) => [d.source], issues),
      listings: toDatum(set.marketplace, listings, "count", (d) => [d.source], issues),
      topicInterest: toDatum(set.topicInterest, topic, "pageviews_per_month", (d) => [d.source], issues),
      duties: regimeOf(country) === "other" ? null : (global.duties.get(regimeOf(country) as Exclude<ReturnType<typeof regimeOf>, "other">) ?? null),
      vat: global.vat.get(country) ?? insufficient("Taux de TVA inconnu pour ce pays.", ["vat-rates"]),
    },
    issues,
  };
}

function byPlatform<T extends { platform: "meta" | "tiktok"; meta: { id: ProviderId } }>(list: readonly T[], platform: "meta" | "tiktok"): T {
  const provider = list.find((p) => p.platform === platform);
  if (!provider) throw new Error(`No provider registered for platform ${platform}`);
  return provider;
}

/** Run `fn` over items with at most `limit` in flight, preserving input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const COLLECTION = { countryConcurrency: COUNTRY_CONCURRENCY } as const;
