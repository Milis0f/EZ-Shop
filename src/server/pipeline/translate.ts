import type { CollectionIssue } from "@/domain/analysis";
import { getCountry, type CountryCode, type LanguageCode } from "@/domain/country";
import type { ProductQuery, ProductTerm } from "@/domain/product";
import { normalizeTerm } from "@/engine/terms/expand";
import type { TranslationProvider } from "@/providers/contracts";

/**
 * Adds a machine translation of the product name for every market language without a term,
 * plus English (customs search, AliExpress). Terms typed by the user are never replaced.
 */
export async function addMachineTranslations(
  product: ProductQuery,
  countries: readonly CountryCode[],
  translator: TranslationProvider,
): Promise<{ product: ProductQuery; issues: CollectionIssue[] }> {
  const covered = new Set(product.terms.map((t) => t.language));
  const wanted = new Set<LanguageCode>([...countries.map((c) => getCountry(c).languages[0]), "en"]);
  const missing = [...wanted].filter((language) => !covered.has(language));
  if (missing.length === 0) return { product, issues: [] };

  const issues: CollectionIssue[] = [];
  const results = await Promise.all(missing.map(async (language) => ({ language, result: await translator.translate(product.displayName, product.inputLanguage, language) })));
  const added: ProductTerm[] = results.flatMap(({ language, result }) => {
    if (!result.ok) {
      issues.push({ providerId: translator.meta.id, code: result.error.code, message: `${result.error.message} (${language})` });
      return [];
    }
    return [{ term: normalizeTerm(result.data.text), language, kind: "translation" as const, source: "machine" as const }];
  });
  return { product: { ...product, terms: [...product.terms, ...added] }, issues };
}
