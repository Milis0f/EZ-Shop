import { getCountry, type CountryCode, type LanguageCode } from "@/domain/country";
import type { ProductQuery, ProductTerm } from "@/domain/product";

/**
 * Term expansion. Rule-based only — it never invents translations:
 * multilingual terms come from the user (extraTerms) until an expansion provider exists.
 *
 * TODO(llm-expansion): add a TermExpansionProvider (e.g. Claude API) returning synonyms and
 * translations tagged `source: "llm"`, shown for user validation before being queried.
 * TODO(google-ads-ideas): KeywordPlanIdeaService.GenerateKeywordIdeas → `source: "google-ads-ideas"`.
 */

export const normalizeTerm = (raw: string): string => raw.trim().replace(/\s+/g, " ").toLowerCase();

export const stripAccents = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export const canonicalKey = (raw: string): string =>
  stripAccents(normalizeTerm(raw)).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const PLURAL_LANGUAGES: readonly LanguageCode[] = ["fr", "en", "es", "pt"];

/** Orthographic variants of a single-word term (plural/singular, accent-free). */
export function orthographicVariants(term: string, language: LanguageCode): string[] {
  const variants = new Set<string>();
  const plain = stripAccents(term);
  if (plain !== term) variants.add(plain);
  if (!term.includes(" ") && PLURAL_LANGUAGES.includes(language) && term.length > 3) {
    if (language === "fr" && term.endsWith("eau")) variants.add(`${term}x`);
    else if (term.endsWith("s") || term.endsWith("x")) variants.add(term.slice(0, -1));
    else variants.add(`${term}s`);
  }
  variants.delete(term);
  return [...variants];
}

export interface ExpansionInput {
  readonly productName: string;
  readonly inputLanguage: LanguageCode;
  readonly extraTerms: ReadonlyArray<{ readonly language: LanguageCode; readonly term: string }>;
}

export function expandProduct(input: ExpansionInput): ProductQuery {
  const base = normalizeTerm(input.productName);
  const terms = new Map<string, ProductTerm>();
  const add = (t: ProductTerm) => {
    const key = `${t.language}|${t.term}`;
    if (!terms.has(key)) terms.set(key, t);
  };

  add({ term: base, language: input.inputLanguage, kind: "input", source: "user" });
  for (const extra of input.extraTerms) {
    const term = normalizeTerm(extra.term);
    add({ term, language: extra.language, kind: extra.language === input.inputLanguage ? "synonym" : "translation", source: "user" });
  }
  for (const t of [...terms.values()]) {
    for (const v of orthographicVariants(t.term, t.language)) add({ term: v, language: t.language, kind: "variant", source: "rules" });
  }

  return {
    canonicalKey: canonicalKey(input.productName),
    displayName: input.productName.trim(),
    inputLanguage: input.inputLanguage,
    terms: [...terms.values()],
  };
}

export interface CountryTerms {
  /** Terms sent to providers. Orthographic variants are excluded: Google Ads groups close
   *  variants itself, and summing them would double-count demand. */
  readonly queryTerms: readonly ProductTerm[];
  readonly language: LanguageCode;
  /** True when no term exists in any language of the country (input terms used as fallback). */
  readonly languageMismatch: boolean;
}

export function termsForCountry(product: ProductQuery, country: CountryCode): CountryTerms {
  const { languages } = getCountry(country);
  const queryable = product.terms.filter((t) => t.kind !== "variant");
  for (const language of languages) {
    const matching = queryable.filter((t) => t.language === language);
    if (matching.length > 0) return { queryTerms: matching, language, languageMismatch: false };
  }
  return {
    queryTerms: queryable.filter((t) => t.language === product.inputLanguage),
    language: languages[0],
    languageMismatch: true,
  };
}
