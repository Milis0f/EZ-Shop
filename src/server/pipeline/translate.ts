import type { CollectionIssue } from "@/domain/analysis";
import { getCountry, type CountryCode, type LanguageCode } from "@/domain/country";
import type { ProductQuery, ProductTerm } from "@/domain/product";
import { normalizeTerm } from "@/engine/terms/expand";
import { ok } from "@/providers/contracts";
import type { TopicInterestProvider, TranslationProvider } from "@/providers/contracts";

/**
 * Adds a machine translation of the product name for every market language without a term,
 * plus English (customs search, AliExpress). Terms typed by the user are never replaced.
 *
 * When the name is exactly a Wikipedia article, the same concept's title in the other language comes
 * first: "casquette" gives "Mütze" through Wikidata, which people curate, and memory-based translators
 * can give "Deckel" (lid). The translator handles everything else.
 */
export async function addMachineTranslations(
  product: ProductQuery,
  countries: readonly CountryCode[],
  translator: TranslationProvider,
  topic?: TopicInterestProvider,
): Promise<{ product: ProductQuery; issues: CollectionIssue[] }> {
  const covered = new Set(product.terms.map((t) => t.language));
  const wanted = new Set<LanguageCode>([...countries.map((c) => getCountry(c).languages[0]), "en"]);
  const missing = [...wanted].filter((language) => !covered.has(language));
  if (missing.length === 0) return { product, issues: [] };

  const issues: CollectionIssue[] = [];
  const concept = topic ? await topic.resolveEntity([product.displayName], product.inputLanguage) : null;
  const wikidataId = concept?.ok ? concept.data.wikidataId : null;
  const fromConcept = async (language: LanguageCode): Promise<string | null> => {
    const title = wikidataId && topic ? await topic.conceptTitle(wikidataId, language) : null;
    // "Cap (headgear)": the disambiguation is not part of the name.
    return title ? title.replace(/\s*\([^)]*\)\s*$/, "") : null;
  };
  const results = await Promise.all(
    missing.map(async (language) => {
      const title = await fromConcept(language);
      return { language, result: title ? ok({ text: title, match: 1 }) : await translator.translate(product.displayName, product.inputLanguage, language) };
    }),
  );
  const added: ProductTerm[] = results.flatMap(({ language, result }) => {
    if (!result.ok) {
      issues.push({ providerId: translator.meta.id, code: result.error.code, message: `${result.error.message} (${language})` });
      return [];
    }
    return [{ term: normalizeTerm(result.data.text), language, kind: "translation" as const, source: "machine" as const }];
  });
  return { product: { ...product, terms: [...product.terms, ...added] }, issues };
}
