import {
  fail,
  type AdCostObservation,
  type AdCostProvider,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
} from "../contracts";

/**
 * Pre-launch cost estimates for social platforms require an ad account.
 *
 * TODO(meta-marketing): Marketing API `delivery_estimate` on a draft ad set
 *   (targeting = country, optimization goal = OFFSITE_CONVERSIONS) → derive a CPM range.
 *   https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-delivery-estimate/
 * TODO(tiktok-business): API for Business reach / bid estimates for a draft ad group.
 *   https://business-api.tiktok.com/portal/docs/api-reference/v1.3
 *
 * Until then both return `not_implemented`, and the engine shows DATA_INSUFFICIENT
 * for Meta / TikTok CPC, CPA and test budget.
 */

export const metaMarketingMeta: ProviderMeta = {
  id: "meta-marketing-api",
  name: "Meta Marketing API — delivery estimate",
  category: "ad_cost",
  authMode: "oauth",
  access: "account",
  docsUrl: "https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-delivery-estimate/",
  qualityTier: 0.75,
  connectorVersion: "0.0.0",
  requiredEnv: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  coverage: { kind: "all" },
  verification: "not_implemented",
  notes: ["Estimation officielle dépendante du ciblage et de l'objectif — jamais une garantie de coût."],
};

export const tiktokBusinessMeta: ProviderMeta = {
  id: "tiktok-business-api",
  name: "TikTok API for Business — estimations",
  category: "ad_cost",
  authMode: "oauth",
  access: "account",
  docsUrl: "https://business-api.tiktok.com/portal/docs/api-reference/v1.3",
  qualityTier: 0.7,
  connectorVersion: "0.0.0",
  requiredEnv: ["TIKTOK_BUSINESS_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"],
  coverage: { kind: "all" },
  verification: "not_implemented",
  notes: ["Le Reach Estimator dépend du budget, de l'objectif, du ciblage et de la stratégie d'enchères."],
};

class NotImplementedAdCostProvider implements AdCostProvider {
  constructor(
    readonly meta: ProviderMeta,
    readonly platform: "meta" | "tiktok",
  ) {}

  status(): ProviderStatus {
    return { state: "not_implemented", detail: "Connecteur à implémenter (compte publicitaire requis)." };
  }

  async getCostEstimate(): Promise<ProviderResult<AdCostObservation>> {
    return fail("not_implemented", `${this.meta.name} : connecteur non implémenté.`);
  }
}

export const createMetaMarketingProvider = (): AdCostProvider =>
  new NotImplementedAdCostProvider(metaMarketingMeta, "meta");

export const createTikTokBusinessProvider = (): AdCostProvider =>
  new NotImplementedAdCostProvider(tiktokBusinessMeta, "tiktok");
