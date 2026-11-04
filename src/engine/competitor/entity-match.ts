/**
 * Is this listing the same product as that one? Used before any price comparison across shops and
 * marketplaces. Two lookalike products are never compared: only an exact identifier, an exact
 * reference or a strong match allow it.
 */

export const MATCH_LEVELS = ["exact_id", "exact_ref", "strong", "uncertain", "different"] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

export interface ListingIdentity {
  readonly title: string;
  readonly brand?: string | null;
  /** GTIN / EAN / UPC, any length; digits only once normalised. */
  readonly gtin?: string | null;
  /** Manufacturer part number or the seller's SKU. */
  readonly mpn?: string | null;
  readonly price?: number | null;
}

export interface MatchResult {
  readonly level: MatchLevel;
  /** Share of title words in common, 0–1. */
  readonly titleSimilarity: number;
  readonly reasons: readonly string[];
}

/** Title similarity needed, with the same brand, for a strong match. */
const STRONG_TITLE = 0.75;
/** Below this, two titles are different products. */
const DIFFERENT_TITLE = 0.3;
/** Prices more than this many times apart are not the same offer of the same product. */
const PRICE_RATIO = 3;

const STOP_WORDS = new Set(["the", "a", "an", "and", "for", "with", "de", "la", "le", "les", "et", "pour", "avec", "du", "des", "en", "un", "une", "el", "y", "con", "para", "der", "die", "das", "und", "mit", "für"]);

/** GTIN with its leading zeros removed, so a UPC-12 and its EAN-13 form compare equal. */
export function normaliseGtin(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.replace(/^0+/, "");
}

const normaliseRef = (value: string | null | undefined): string | null => {
  const ref = (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ref.length >= 4 ? ref : null;
};

const normaliseBrand = (value: string | null | undefined): string | null => {
  const brand = (value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  return brand.length > 0 ? brand : null;
};

export function titleWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
}

/** Jaccard index of the two titles' words. */
export function titleSimilarity(a: string, b: string): number {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return common / (left.size + right.size - common);
}

const pricesApart = (a: number | null | undefined, b: number | null | undefined): boolean =>
  typeof a === "number" && typeof b === "number" && a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > PRICE_RATIO;

export function matchListings(a: ListingIdentity, b: ListingIdentity): MatchResult {
  const similarity = Math.round(titleSimilarity(a.title, b.title) * 100) / 100;
  const gtinA = normaliseGtin(a.gtin);
  const gtinB = normaliseGtin(b.gtin);
  if (gtinA && gtinB) {
    return gtinA === gtinB
      ? { level: "exact_id", titleSimilarity: similarity, reasons: ["same_gtin"] }
      : { level: "different", titleSimilarity: similarity, reasons: ["different_gtin"] };
  }
  const brandA = normaliseBrand(a.brand);
  const brandB = normaliseBrand(b.brand);
  const brandsDiffer = brandA !== null && brandB !== null && brandA !== brandB;
  const refA = normaliseRef(a.mpn);
  const refB = normaliseRef(b.mpn);
  if (refA && refB && refA === refB && !brandsDiffer) return { level: "exact_ref", titleSimilarity: similarity, reasons: brandA ? ["same_brand", "same_reference"] : ["same_reference"] };
  if (brandsDiffer) return { level: "different", titleSimilarity: similarity, reasons: ["different_brand"] };
  if (similarity < DIFFERENT_TITLE) return { level: "different", titleSimilarity: similarity, reasons: ["different_title"] };
  const reasons: string[] = [];
  if (pricesApart(a.price, b.price)) reasons.push("prices_far_apart");
  const sameBrand = brandA !== null && brandA === brandB;
  if (sameBrand && similarity >= STRONG_TITLE && reasons.length === 0) return { level: "strong", titleSimilarity: similarity, reasons: ["same_brand", "close_title"] };
  return { level: "uncertain", titleSimilarity: similarity, reasons: [...reasons, sameBrand ? "same_brand" : "brand_unknown"] };
}

/** Only these levels allow comparing the two prices. */
export function allowsPriceComparison(level: MatchLevel): boolean {
  return level === "exact_id" || level === "exact_ref" || level === "strong";
}
