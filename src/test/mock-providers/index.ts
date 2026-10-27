import { aliexpressMeta } from "@/providers/aliexpress/adapter";
import { ukTradeTariffMeta } from "@/providers/customs/uk-trade-tariff";
import { usitcMeta } from "@/providers/customs/usitc";
import { ebayMeta } from "@/providers/ebay/adapter";
import { googleAutocompleteMeta } from "@/providers/google-autocomplete/adapter";
import { ecbFxMeta } from "@/providers/reference/ecb-fx";
import { vatRatesMeta } from "@/providers/reference/vat-rates";
import type { ProviderSet } from "@/providers/registry";
import { myMemoryMeta } from "@/providers/translation/mymemory";
import {
  unavailableContent,
  unavailableFx,
  unavailableMarketplace,
  unavailableSourcing,
  unavailableSuggest,
  unavailableTariff,
  unavailableTopic,
  unavailableTranslator,
  unavailableVat,
} from "@/test/unavailable-providers";
import { wikimediaMeta } from "@/providers/wikimedia/adapter";
import { youtubeMeta } from "@/providers/youtube/adapter";
import { createMockProviders } from "./mock-providers";

export { createMockProviders } from "./mock-providers";

/**
 * Tests only: a complete, offline provider set built from the synthetic fixtures, injected through
 * the `providers` seam of runAnalysis. Sources without a fixture are unavailable, never invented.
 */
export function createMockProviderSet(now: () => Date = () => new Date()): ProviderSet {
  return {
    mode: "live",
    ...createMockProviders(now),
    suggest: unavailableSuggest(googleAutocompleteMeta),
    topicInterest: unavailableTopic(wikimediaMeta),
    content: unavailableContent(youtubeMeta),
    marketplace: unavailableMarketplace(ebayMeta),
    sourcing: unavailableSourcing(aliexpressMeta),
    tariffs: [unavailableTariff(ukTradeTariffMeta, ["gb", "eu"]), unavailableTariff(usitcMeta, ["us"])],
    vat: unavailableVat(vatRatesMeta),
    fx: unavailableFx(ecbFxMeta),
    translator: unavailableTranslator(myMemoryMeta),
  };
}
