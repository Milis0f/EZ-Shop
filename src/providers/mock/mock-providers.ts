/**
 * ⚠ DEVELOPMENT FIXTURES — every value produced here carries `origin: "mock"`
 * and is rendered with a MOCK badge. Only the provider registry may import this file,
 * and only when mock data is allowed (never in production).
 */

import type { CountryCode } from "@/domain/country";
import type { ProviderId, SourceRef } from "@/domain/provenance";
import { monthsBetween } from "@/domain/time";
import { normal, uniform } from "@/lib/random";
import { metaMarketingMeta, tiktokBusinessMeta } from "../ad-cost/adapters";
import { aggregateAds, type RawAd } from "../ad-activity";
import {
  fail,
  isCovered,
  ok,
  type AdActivityObservation,
  type AdActivityQuery,
  type AdCostObservation,
  type AdCostProvider,
  type AdCostQuery,
  type AdLibraryProvider,
  type KeywordMetrics,
  type KeywordMetricsProvider,
  type KeywordMetricsQuery,
  type MacroBatch,
  type MacroIndicatorId,
  type MacroIndicatorProvider,
  type MacroObservation,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type SearchInterestProvider,
  type SearchInterestQuery,
  type TermInterestSeries,
} from "../contracts";
import { eurostatMeta } from "../eurostat/adapter";
import { googleAdsMeta } from "../google-ads/adapter";
import { googleTrendsMeta } from "../google-trends/adapter";
import { metaAdLibraryMeta } from "../meta-ad-library/adapter";
import { oecdMeta } from "../oecd/adapter";
import { tiktokCommercialMeta } from "../tiktok-commercial/adapter";
import { worldBankMeta } from "../world-bank/adapter";
import { adProfile, latentSeries, mockSeedRng, roundVolume } from "./generator";

const MOCK_STATUS: ProviderStatus = { state: "mock", detail: "Données fictives de développement — aucune valeur réelle." };

const mockMeta = (meta: ProviderMeta): ProviderMeta => ({
  ...meta,
  name: `${meta.name} [MOCK]`,
  notes: ["⚠ Données synthétiques générées localement pour le développement visuel.", ...meta.notes],
});

const mockSource = (id: ProviderId, now: Date, queryRef: string, period?: SourceRef["period"]): SourceRef => ({
  sourceId: id,
  origin: "mock",
  collectedAt: now.toISOString(),
  connectorVersion: "mock-1",
  queryRef: `mock://${queryRef}`,
  period,
});

export class MockSearchInterestProvider implements SearchInterestProvider {
  readonly meta = mockMeta(googleTrendsMeta);
  constructor(private readonly now: () => Date) {}
  status = () => MOCK_STATUS;

  async getInterestOverTime(q: SearchInterestQuery): Promise<ProviderResult<readonly TermInterestSeries[]>> {
    const months = monthsBetween(q.from, q.to) + 1;
    return ok(
      q.terms.slice(0, 5).map((term) => {
        const series = latentSeries(term, q.country, q.to, months);
        const max = Math.max(...series.map((p) => p.value));
        return {
          term,
          points: series.map((p) => ({ month: p.month, value: Math.round((p.value / max) * 100) })),
          source: mockSource(this.meta.id, this.now(), `trends/${q.country}/${term}`, { start: q.from, end: q.to }),
        };
      }),
    );
  }
}

export class MockKeywordMetricsProvider implements KeywordMetricsProvider {
  readonly meta = mockMeta(googleAdsMeta);
  constructor(private readonly now: () => Date) {}
  status = () => MOCK_STATUS;

  async getKeywordMetrics(q: KeywordMetricsQuery): Promise<ProviderResult<readonly KeywordMetrics[]>> {
    const months = monthsBetween(q.from, q.to) + 1;
    return ok(
      q.terms.map((term): KeywordMetrics => {
        const rng = mockSeedRng("kp", term, q.country);
        const volumes = latentSeries(term, q.country, q.to, months).map((p) => ({ month: p.month, value: roundVolume(p.value) }));
        const last12 = volumes.slice(-12);
        const low = uniform(rng, 0.12, 1.1);
        return {
          term,
          avgMonthlySearches: roundVolume(last12.reduce((s, p) => s + p.value, 0) / Math.max(1, last12.length)),
          monthlyVolumes: volumes,
          competitionIndex: Math.round(uniform(rng, 8, 95)),
          lowTopOfPageBid: Number(low.toFixed(2)),
          highTopOfPageBid: Number((low * uniform(rng, 1.8, 4)).toFixed(2)),
          currency: "EUR",
          source: mockSource(this.meta.id, this.now(), `kp/${q.country}/${q.language}/${term}`, { start: q.from, end: q.to }),
        };
      }),
    );
  }
}

export class MockAdLibraryProvider implements AdLibraryProvider {
  readonly meta: ProviderMeta;
  constructor(
    readonly platform: "meta" | "tiktok",
    private readonly now: () => Date,
  ) {
    this.meta = mockMeta(platform === "meta" ? metaAdLibraryMeta : tiktokCommercialMeta);
  }
  status = () => MOCK_STATUS;

  async getAdActivity(q: AdActivityQuery): Promise<ProviderResult<AdActivityObservation>> {
    if (!isCovered(this.meta, q.country)) return fail("unsupported_country", `${this.meta.name} : hors couverture (UE).`);
    const term = q.terms[0] ?? "";
    const profile = adProfile(this.platform, term, q.country);
    const rng = mockSeedRng("adlist", this.platform, term, q.country);
    const today = this.now().toISOString().slice(0, 10);
    const sinceMs = Date.parse(`${q.since}T00:00:00Z`);
    const weeks = Math.max(1, Math.round((this.now().getTime() - sinceMs) / (7 * 86_400_000)));

    const ads: RawAd[] = [];
    const advertisers = Math.max(1, Math.round(profile.activeAds * profile.advertiserRatio));
    for (let w = 0; w < weeks; w += 1) {
      const expected = (profile.activeAds / 12) * Math.pow(1 + profile.weeklyGrowth, w - weeks);
      const count = Math.max(0, Math.round(expected * Math.exp(0.25 * normal(rng))));
      for (let i = 0; i < count; i += 1) {
        const start = new Date(sinceMs + (w * 7 + Math.floor(rng() * 7)) * 86_400_000).toISOString().slice(0, 10);
        const stillActive = rng() < 0.55;
        ads.push({
          id: `${this.platform}-${w}-${i}`,
          advertiserId: `adv-${Math.floor(rng() * advertisers)}`,
          startDate: start > today ? today : start,
          stopDate: stillActive ? undefined : start,
        });
      }
    }
    const source = mockSource(this.meta.id, this.now(), `adlib/${this.platform}/${q.country}/${term}`, { start: q.since, end: today });
    return ok({ ...aggregateAds(ads, today, q.since), truncated: false, source });
  }
}

export class MockAdCostProvider implements AdCostProvider {
  readonly meta: ProviderMeta;
  constructor(
    readonly platform: "meta" | "tiktok",
    private readonly now: () => Date,
  ) {
    this.meta = mockMeta(platform === "meta" ? metaMarketingMeta : tiktokBusinessMeta);
  }
  status = () => MOCK_STATUS;

  async getCostEstimate(q: AdCostQuery): Promise<ProviderResult<AdCostObservation>> {
    const rng = mockSeedRng("cpm", this.platform, q.terms[0] ?? "", q.country);
    const low = this.platform === "meta" ? uniform(rng, 4, 9) : uniform(rng, 3, 7);
    return ok({
      metric: "cpm",
      low: Number(low.toFixed(2)),
      high: Number((low * uniform(rng, 1.5, 2.5)).toFixed(2)),
      currency: "EUR",
      source: mockSource(this.meta.id, this.now(), `cost/${this.platform}/${q.country}`),
    });
  }
}

const MACRO_RANGES: Record<MacroIndicatorId, readonly [number, number]> = {
  population: [500_000, 90_000_000],
  gdp_per_capita_ppp: [30_000, 95_000],
  internet_users_pct: [84, 99],
  online_buyers_pct: [50, 95],
  consumer_confidence: [95, 102],
};

export class MockMacroProvider implements MacroIndicatorProvider {
  readonly meta: ProviderMeta;
  constructor(
    base: ProviderMeta,
    readonly indicators: readonly MacroIndicatorId[],
    private readonly now: () => Date,
  ) {
    this.meta = mockMeta(base);
  }
  status = () => MOCK_STATUS;

  async getIndicators(countries: readonly CountryCode[]): Promise<ProviderResult<MacroBatch>> {
    const year = String(this.now().getUTCFullYear() - 1);
    const observations = countries
      .filter((c) => isCovered(this.meta, c))
      .flatMap((country) =>
        this.indicators.map((indicator): MacroObservation => {
          const [min, max] = MACRO_RANGES[indicator];
          const value = uniform(mockSeedRng("macro", indicator, country), min, max);
          return {
            country,
            indicator,
            value: Number(value.toFixed(indicator === "population" ? 0 : 2)),
            source: mockSource(this.meta.id, this.now(), `macro/${indicator}/${country}`, { start: year, end: year }),
          };
        }),
      );
    return ok({ observations, partialErrors: [] });
  }
}

export function createMockProviders(now: () => Date) {
  return {
    searchInterest: new MockSearchInterestProvider(now),
    keywordMetrics: new MockKeywordMetricsProvider(now),
    adLibraries: [new MockAdLibraryProvider("meta", now), new MockAdLibraryProvider("tiktok", now)],
    adCosts: [new MockAdCostProvider("meta", now), new MockAdCostProvider("tiktok", now)],
    macro: [
      new MockMacroProvider(worldBankMeta, ["population", "gdp_per_capita_ppp", "internet_users_pct"], now),
      new MockMacroProvider(eurostatMeta, ["online_buyers_pct"], now),
      new MockMacroProvider(oecdMeta, ["consumer_confidence"], now),
    ],
  };
}
