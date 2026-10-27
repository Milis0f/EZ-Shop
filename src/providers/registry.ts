import type { ServerEnv } from "@/config/env";
import type { ProviderStatusSnapshot } from "@/domain/analysis";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  createMetaMarketingProvider,
  createTikTokBusinessProvider,
  metaMarketingMeta,
  tiktokBusinessMeta,
} from "./ad-cost/adapters";
import { AliExpressProvider, aliexpressMeta } from "./aliexpress/adapter";
import type {
  AdCostProvider,
  AdLibraryProvider,
  ContentProvider,
  DataProvider,
  FxProvider,
  KeywordMetricsProvider,
  MacroIndicatorProvider,
  MarketplaceProvider,
  ProviderMeta,
  SearchInterestProvider,
  SourcingProvider,
  SuggestProvider,
  TariffProvider,
  TopicInterestProvider,
  TranslationProvider,
  VatProvider,
} from "./contracts";
import { UkTradeTariffProvider, ukTradeTariffMeta } from "./customs/uk-trade-tariff";
import { UsitcProvider, usitcMeta } from "./customs/usitc";
import { EbayBrowseProvider, ebayMeta } from "./ebay/adapter";
import { EurostatProvider, eurostatMeta } from "./eurostat/adapter";
import { GoogleAdsKeywordPlannerProvider, googleAdsMeta } from "./google-ads/adapter";
import { GoogleAutocompleteProvider, googleAutocompleteMeta } from "./google-autocomplete/adapter";
import { GoogleTrendsProvider, googleTrendsMeta } from "./google-trends/adapter";
import { MetaAdLibraryProvider, metaAdLibraryMeta } from "./meta-ad-library/adapter";
import { OecdProvider, oecdMeta } from "./oecd/adapter";
import { EcbFxProvider, ecbFxMeta } from "./reference/ecb-fx";
import { VatRatesProvider, vatRatesMeta } from "./reference/vat-rates";
import { TikTokCommercialContentProvider, tiktokCommercialMeta } from "./tiktok-commercial/adapter";
import { MyMemoryProvider, myMemoryMeta } from "./translation/mymemory";
import { WikimediaProvider, wikimediaMeta } from "./wikimedia/adapter";
import { WorldBankProvider, worldBankMeta } from "./world-bank/adapter";
import { YouTubeProvider, youtubeMeta } from "./youtube/adapter";

export interface ProviderSet {
  /** Always live: synthetic fixtures exist only under src/test/ and are injected by tests. */
  readonly mode: "live";
  readonly searchInterest: SearchInterestProvider;
  readonly keywordMetrics: KeywordMetricsProvider;
  readonly adLibraries: readonly AdLibraryProvider[];
  readonly adCosts: readonly AdCostProvider[];
  readonly macro: readonly MacroIndicatorProvider[];
  // Data sources v2.
  readonly suggest: SuggestProvider;
  readonly topicInterest: TopicInterestProvider;
  readonly content: ContentProvider;
  readonly marketplace: MarketplaceProvider;
  readonly sourcing: SourcingProvider;
  readonly tariffs: readonly TariffProvider[];
  readonly vat: VatProvider;
  readonly fx: FxProvider;
  readonly translator: TranslationProvider;
}

export interface ProviderDeps {
  readonly env: ServerEnv;
  readonly cache: ProviderCacheRepository;
  readonly now?: () => Date;
}

export function createProviderSet(deps: ProviderDeps): ProviderSet {
  const now = deps.now ?? (() => new Date());
  const { env, cache } = deps;
  const timeout = env.PROVIDER_HTTP_TIMEOUT_MS;
  return {
    mode: "live",
    searchInterest: new GoogleTrendsProvider(env),
    keywordMetrics: new GoogleAdsKeywordPlannerProvider(env, timeout),
    adLibraries: [new MetaAdLibraryProvider(env, timeout), new TikTokCommercialContentProvider(env, timeout)],
    adCosts: [createMetaMarketingProvider(), createTikTokBusinessProvider()],
    macro: [new WorldBankProvider(cache, timeout), new EurostatProvider(cache, timeout, now), new OecdProvider(cache, timeout, now)],
    suggest: new GoogleAutocompleteProvider(cache, timeout),
    topicInterest: new WikimediaProvider(cache, timeout, env.WIKIMEDIA_CONTACT),
    content: new YouTubeProvider(env, cache, timeout),
    marketplace: new EbayBrowseProvider(env, cache, timeout),
    sourcing: new AliExpressProvider(env, cache, timeout),
    tariffs: [new UkTradeTariffProvider(cache, timeout), new UsitcProvider(cache, timeout)],
    vat: new VatRatesProvider(cache, timeout),
    fx: new EcbFxProvider(cache, timeout),
    translator: new MyMemoryProvider(cache, timeout),
  };
}

/** Metadata of the real connectors (DB registry, connectors page). */
export const REAL_PROVIDER_METAS: readonly ProviderMeta[] = [
  googleTrendsMeta,
  googleAdsMeta,
  metaAdLibraryMeta,
  tiktokCommercialMeta,
  metaMarketingMeta,
  tiktokBusinessMeta,
  worldBankMeta,
  eurostatMeta,
  oecdMeta,
  googleAutocompleteMeta,
  wikimediaMeta,
  ukTradeTariffMeta,
  usitcMeta,
  vatRatesMeta,
  ecbFxMeta,
  myMemoryMeta,
  youtubeMeta,
  ebayMeta,
  aliexpressMeta,
];

export function listProviders(set: ProviderSet): DataProvider[] {
  return [
    set.searchInterest,
    set.keywordMetrics,
    ...set.adLibraries,
    ...set.adCosts,
    ...set.macro,
    set.suggest,
    set.topicInterest,
    set.content,
    set.marketplace,
    set.sourcing,
    ...set.tariffs,
    set.vat,
    set.fx,
    set.translator,
  ];
}

export function snapshotStatuses(set: ProviderSet): ProviderStatusSnapshot[] {
  return listProviders(set).map((p) => {
    const status = p.status();
    return { providerId: p.meta.id, state: status.state, detail: status.detail };
  });
}
