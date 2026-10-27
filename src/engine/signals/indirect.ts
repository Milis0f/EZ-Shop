import { derived, insufficient, isKnown, type Datum } from "@/domain/datum";
import type { LanguageCode } from "@/domain/country";
import type { ContentActivity, MarketplaceListings, SearchSuggestions } from "@/domain/signals";
import type { ContentObservation, ListingsObservation, SuggestionsObservation } from "@/providers/contracts";
import { round } from "../stats/normalize";

/**
 * Turns raw indirect signals into the figures shown and scored. Pure functions; every output keeps
 * the sources of its inputs and says how it was computed.
 */

/** Words that show a purchase intent in a suggestion, per language (lower case, accents kept). */
const INTENT_WORDS: Readonly<Record<LanguageCode, readonly string[]>> = {
  fr: ["acheter", "achat", "prix", "pas cher", "avis", "promo", "meilleur", "meilleure", "comparatif", "test", "solde", "commander"],
  en: ["buy", "price", "cheap", "review", "reviews", "best", "deal", "sale", "discount", "where to buy", "for sale"],
  de: ["kaufen", "preis", "günstig", "test", "testsieger", "erfahrungen", "bestellen", "angebot", "beste", "bester"],
  nl: ["kopen", "prijs", "goedkoop", "review", "beste", "aanbieding", "test", "bestellen"],
  es: ["comprar", "precio", "barato", "barata", "opiniones", "mejor", "oferta", "análisis"],
  it: ["comprare", "acquistare", "prezzo", "economico", "economica", "recensioni", "migliore", "offerta", "opinioni"],
  pt: ["comprar", "preço", "barato", "barata", "opiniões", "melhor", "promoção"],
  pl: ["kupić", "kup", "cena", "tanie", "opinie", "najlepsze", "promocja", "ranking"],
  sv: ["köpa", "köp", "pris", "billig", "billiga", "recension", "bäst", "test"],
  da: ["købe", "køb", "pris", "billig", "billige", "anmeldelse", "bedst", "test"],
};

const MARKETPLACE_NAMES = [
  "amazon", "aliexpress", "ebay", "temu", "shein", "wish", "cdiscount", "fnac", "decathlon", "lidl", "action",
  "bol.com", "allegro", "zalando", "otto", "walmart", "target", "etsy", "kaufland", "ikea", "carrefour", "darty",
  "boulanger", "mediamarkt", "argos", "costco", "best buy", "leroy merlin",
] as const;

const containsWord = (text: string, word: string): boolean =>
  new RegExp(`(^|[\\s'’.,-])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s'’.,-])`, "u").test(text);

export function readSuggestions(obs: Datum<SuggestionsObservation>, language: LanguageCode): Datum<SearchSuggestions> {
  if (!isKnown(obs)) return obs;
  const words = INTENT_WORDS[language];
  const suggestions = obs.value.suggestions;
  return derived(
    {
      suggestions,
      intent: suggestions.filter((s) => words.some((w) => containsWord(s, w))),
      marketplaces: suggestions.filter((s) => MARKETPLACE_NAMES.some((m) => containsWord(s, m))),
    },
    "count",
    { method: "autocomplete_intent_and_marketplace_words_v1", inputs: [obs] },
  );
}

export function readContent(obs: Datum<ContentObservation>, now: Date): Datum<ContentActivity> {
  if (!isKnown(obs)) return obs;
  const { totalResults, videos } = obs.value;
  const dated = videos.filter((v) => v.publishedAt);
  const recent = dated.filter((v) => now.getTime() - Date.parse(v.publishedAt) <= 90 * 86_400_000).length;
  return derived(
    {
      videosLast12Months: totalResults,
      sampledVideos: videos.length,
      videos,
      // Derived view statistics are disabled pending the licence check.
      medianViews: null,
      recentShare: dated.length > 0 ? round(recent / dated.length, 3) : null,
    },
    "count",
    {
      method: "youtube_search_sample_v2",
      inputs: [obs],
      note: "Nombre de vidéos estimé par YouTube (approximatif) et vidéos les plus pertinentes, telles qu'observées.",
    },
  );
}

const MAX_OBSERVED_PRICES = 5;

/**
 * Listing count, at most five asking prices as displayed (observed, not sales) and the China share from a
 * separately filtered count. No price statistic is derived from the listings.
 */
export function readMarketplace(obs: Datum<ListingsObservation>): Datum<MarketplaceListings> {
  if (!isKnown(obs)) return obs;
  const { total, prices, chinaTotal, marketplaceId } = obs.value;
  return derived(
    {
      marketplaceId,
      listings: total,
      sampled: prices.length,
      observedPrices: prices.slice(0, MAX_OBSERVED_PRICES).map(({ value, currency }) => ({ value, currency })),
      chinaTotal,
      localCurrency: prices[0]?.currency ?? null,
      chinaShare: chinaTotal !== null && total > 0 ? round(Math.min(1, chinaTotal / total), 3) : null,
    },
    "count",
    {
      method: "ebay_browse_sample_v2",
      inputs: [obs],
      note: "Prix affichés observés, pas des ventes.",
    },
  );
}

export const noMarketplaceSite = (countryName: string) =>
  insufficient(`Pas de site eBay national pour ${countryName} : aucune donnée d'un autre pays n'est utilisée.`, ["ebay_national_site"]);
