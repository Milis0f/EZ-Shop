import {
  fail,
  type ContentProvider,
  type FxProvider,
  type MarketplaceProvider,
  type ProviderMeta,
  type ProviderStatus,
  type SourcingProvider,
  type SuggestProvider,
  type TariffProvider,
  type TopicInterestProvider,
  type TranslationProvider,
  type VatProvider,
} from "./contracts";

/**
 * Stand-ins for the data sources v2 in mock mode: no synthetic data is generated for them,
 * so every call fails explicitly and the values stay DATA_INSUFFICIENT.
 */

const status = (): ProviderStatus => ({ state: "not_implemented", detail: "Pas de données fictives pour cette source." });
const none = <T>() => Promise.resolve(fail<T>("not_implemented", "Pas de données fictives pour cette source"));

export const unavailableSuggest = (meta: ProviderMeta): SuggestProvider => ({ meta, status, getSuggestions: none });
export const unavailableTopic = (meta: ProviderMeta): TopicInterestProvider => ({ meta, status, getTopicInterest: none, resolveEntity: none });
export const unavailableContent = (meta: ProviderMeta): ContentProvider => ({ meta, status, getContent: none });
export const unavailableMarketplace = (meta: ProviderMeta): MarketplaceProvider => ({ meta, status, getListings: none });
export const unavailableSourcing = (meta: ProviderMeta): SourcingProvider => ({ meta, status, searchProducts: none });
export const unavailableVat = (meta: ProviderMeta): VatProvider => ({ meta, status, getVatRates: none });
export const unavailableFx = (meta: ProviderMeta): FxProvider => ({ meta, status, getEurRates: none });
export const unavailableTranslator = (meta: ProviderMeta): TranslationProvider => ({ meta, status, translate: none });
export const unavailableTariff = (meta: ProviderMeta, regimes: TariffProvider["regimes"]): TariffProvider => ({
  meta,
  status,
  regimes,
  classify: none,
  getDuties: none,
});
