import type { CollectionIssue } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { insufficient, observed, type Datum, type Known } from "@/domain/datum";
import type { OriginCode } from "@/domain/origin";
import type { ProductQuery } from "@/domain/product";
import type { SourceRef } from "@/domain/provenance";
import type { HsClassification } from "@/domain/signals";
import { regimeOf } from "@/engine/taxes/import-taxes";
import type {
  DataProvider,
  FxRates,
  ProviderResult,
  SourcingObservation,
  TariffDuties,
  TopicEntity,
  TariffRegime,
  VatRate,
} from "@/providers/contracts";
import type { ProviderSet } from "@/providers/registry";

/** Collected once per analysis: shared by every country. */
export interface GlobalSignals {
  readonly fx: Datum<FxRates>;
  readonly vat: ReadonlyMap<CountryCode, Datum<VatRate>>;
  readonly classification: Datum<HsClassification>;
  readonly duties: ReadonlyMap<TariffRegime, Datum<TariffDuties>>;
  readonly sourcing: Datum<SourcingObservation>;
  /** English wording used for customs and AliExpress, and where it comes from. */
  readonly englishTerm: { readonly term: string; readonly from: "user" | "machine" | "wikidata" } | null;
  /** Wikidata concept of the product category, shared by every language. */
  readonly topicEntity: TopicEntity | null;
  readonly issues: readonly CollectionIssue[];
}

export interface GlobalInput {
  readonly countries: readonly CountryCode[];
  /** Issues raised before collection (machine translation), reported with the rest. */
  readonly issues?: readonly CollectionIssue[];
  readonly originCountry?: OriginCode;
  readonly hsCode?: string;
}

function wrap<T>(provider: DataProvider, result: ProviderResult<T>, sourcesOf: (d: T) => readonly SourceRef[], issues: CollectionIssue[]): Datum<T> {
  if (result.ok) return observed(result.data, "none", sourcesOf(result.data));
  issues.push({ providerId: provider.meta.id, code: result.error.code, message: result.error.message });
  return insufficient(result.error.message, [provider.meta.id]);
}

/** English term typed by the user, else its machine translation, else the English label of the Wikidata concept. */
function findEnglishTerm(product: ProductQuery, entity: TopicEntity | null): GlobalSignals["englishTerm"] {
  const typed = product.terms.find((t) => t.language === "en" && t.source === "user");
  if (typed) return { term: typed.term, from: "user" };
  const machine = product.terms.find((t) => t.language === "en" && t.source === "machine");
  if (machine) return { term: machine.term, from: "machine" };
  return entity?.englishLabel ? { term: entity.englishLabel, from: "wikidata" } : null;
}

async function classify(set: ProviderSet, input: GlobalInput, englishTerm: GlobalSignals["englishTerm"], issues: CollectionIssue[]): Promise<Datum<HsClassification>> {
  if (input.hsCode) {
    const user: Known<HsClassification> = {
      status: "known",
      kind: "assumption",
      value: { code: input.hsCode, hs6: input.hsCode.slice(0, 6), description: "Code saisi dans le formulaire", method: "user" },
      unit: "none",
      sources: [{ sourceId: "user-input", origin: "user", collectedAt: new Date().toISOString(), connectorVersion: "form", queryRef: "hs_code" }],
    };
    return user;
  }
  if (!englishTerm) {
    return insufficient("Classement douanier impossible : ajoute une traduction anglaise (en: …) ou le code SH.", ["english_term", "hs_code"]);
  }
  const tariff = set.tariffs.find((t) => t.regimes.includes("gb"));
  if (!tariff) return insufficient("Aucun tarif douanier disponible pour la classification.", ["uk-trade-tariff"]);
  const result = await tariff.classify(englishTerm.term);
  if (!result.ok || !result.data[0]) {
    if (!result.ok) issues.push({ providerId: tariff.meta.id, code: result.error.code, message: result.error.message });
    return insufficient(`Aucun code douanier trouvé pour « ${englishTerm.term} » : saisis le code SH dans le formulaire.`, ["hs_code"]);
  }
  const [best] = result.data;
  return observed<HsClassification>(
    { code: best.code, hs6: best.code.slice(0, 6), description: best.description, method: "search" },
    "none",
    [
      {
        sourceId: tariff.meta.id,
        origin: "live",
        collectedAt: new Date().toISOString(),
        connectorVersion: tariff.meta.connectorVersion,
        queryRef: `search/${englishTerm.term}`,
        sourceUrl: "https://www.trade-tariff.service.gov.uk/find_commodity",
      },
    ],
    `Classement proposé par la recherche du tarif pour « ${englishTerm.term} » : à vérifier.`,
  );
}

export async function collectGlobal(set: ProviderSet, product: ProductQuery, input: GlobalInput): Promise<GlobalSignals> {
  const issues: CollectionIssue[] = [...(input.issues ?? [])];
  const local = product.terms.filter((t) => t.language === product.inputLanguage).map((t) => t.term);
  // The concept is looked up in the input language, then through the English term: one concept for every language.
  const resolved = await set.topicInterest.resolveEntity(local, product.inputLanguage);
  const english = product.terms.filter((t) => t.language === "en" && t.kind !== "variant").map((t) => t.term);
  const viaEnglish = !resolved.ok && english.length > 0 && product.inputLanguage !== "en" ? await set.topicInterest.resolveEntity(english, "en") : null;
  const topicEntity = resolved.ok ? resolved.data : viaEnglish?.ok ? viaEnglish.data : null;
  const englishTerm = findEnglishTerm(product, topicEntity);

  const [fxResult, vatResult, sourcingResult, classification] = await Promise.all([
    set.fx.getEurRates(),
    set.vat.getVatRates(input.countries),
    set.sourcing.searchProducts({ terms: [englishTerm?.term ?? product.displayName], shipTo: input.countries[0] }),
    classify(set, input, englishTerm, issues),
  ]);

  const fx = wrap(set.fx, fxResult, (d) => [d.source], issues);
  const sourcing = wrap(set.sourcing, sourcingResult, (d) => [d.source], issues);
  const vat = new Map<CountryCode, Datum<VatRate>>(
    input.countries.map((country) => {
      if (!vatResult.ok) return [country, insufficient(vatResult.error.message, [set.vat.meta.id])];
      const rate = vatResult.data.find((r) => r.country === country);
      return [country, rate ? observed(rate, "percent", [rate.source], rate.note) : insufficient("Taux de TVA inconnu pour ce pays.", [set.vat.meta.id])];
    }),
  );
  if (!vatResult.ok) issues.push({ providerId: set.vat.meta.id, code: vatResult.error.code, message: vatResult.error.message });

  const regimes = [...new Set(input.countries.map(regimeOf))].filter((r): r is TariffRegime => r !== "other");
  const duties = new Map<TariffRegime, Datum<TariffDuties>>(
    await Promise.all(
      regimes.map(async (regime): Promise<[TariffRegime, Datum<TariffDuties>]> => {
        if (!input.originCountry) return [regime, insufficient("Pays d'origine non renseigné.", ["origin_country"])];
        if (classification.status !== "known") return [regime, insufficient(classification.reason, classification.missing)];
        const provider = set.tariffs.find((t) => t.regimes.includes(regime));
        if (!provider) return [regime, insufficient("Tarif non couvert.", [])];
        const result = await provider.getDuties(regime, classification.value.code, input.originCountry);
        return [regime, wrap(provider, result, (d) => [d.source], issues)];
      }),
    ),
  );

  return { fx, vat, classification, duties, sourcing, englishTerm, topicEntity, issues };
}
