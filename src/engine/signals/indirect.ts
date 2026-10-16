import { derived, insufficient, isKnown, type Datum } from "@/domain/datum";
import type { LanguageCode } from "@/domain/country";
import type { ContentActivity, MarketplaceListings, SearchSuggestions } from "@/domain/signals";
import type { ContentObservation, FxRates, ListingsObservation, SuggestionsObservation } from "@/providers/contracts";
import { quantile } from "../stats/descriptive";
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
  const views = obs.value.videos.flatMap((v) => (v.views === null ? [] : [v.views]));
  const dated = obs.value.videos.filter((v) => v.publishedAt);
  const recent = dated.filter((v) => now.getTime() - Date.parse(v.publishedAt) <= 90 * 86_400_000).length;
  return derived(
    {
      videosLast12Months: obs.value.totalResults,
      sampledVideos: obs.value.videos.length,
      medianViews: views.length > 0 ? Math.round(quantile(views, 0.5)) : null,
      recentShare: dated.length > 0 ? round(recent / dated.length, 3) : null,
    },
    "count",
    {
      method: "youtube_search_sample_v1",
      inputs: [obs],
      note: "Nombre de vidéos estimé par YouTube (approximatif) ; vues médianes des vidéos les plus pertinentes.",
    },
  );
}

/** Listing prices converted to EUR with ECB rates; the China share comes from a separately filtered count. */
export function readMarketplace(obs: Datum<ListingsObservation>, fx: Datum<FxRates>): Datum<MarketplaceListings> {
  if (!isKnown(obs)) return obs;
  const { total, prices, chinaTotal, marketplaceId } = obs.value;
  const rates = isKnown(fx) ? fx.value.rates : null;
  const eur = prices.flatMap((p) => {
    const rate = rates?.[p.currency.toUpperCase()];
    return rate ? [p.value / rate] : [];
  });
  const priceEur =
    eur.length >= 5 ? { p25: round(quantile(eur, 0.25), 2), median: round(quantile(eur, 0.5), 2), p75: round(quantile(eur, 0.75), 2) } : null;
  const inputs = isKnown(fx) ? [obs, fx] : [obs];
  return derived(
    {
      marketplaceId,
      listings: total,
      sampled: prices.length,
      priceEur,
      localCurrency: prices[0]?.currency ?? null,
      chinaShare: chinaTotal !== null && total > 0 ? round(Math.min(1, chinaTotal / total), 3) : null,
    },
    "count",
    {
      method: "ebay_browse_sample_v1",
      inputs,
      note:
        priceEur === null
          ? "Moins de 5 prix exploitables : prix de marché non calculé."
          : `Prix de ${eur.length} annonces, convertis en euros (taux BCE), TVA incluse comme affichés aux acheteurs.`,
    },
  );
}

export const noMarketplaceSite = (countryName: string) =>
  insufficient(`Pas de site eBay national pour ${countryName} : aucune donnée d'un autre pays n'est utilisée.`, ["ebay_national_site"]);
