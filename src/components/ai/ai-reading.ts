import type { AiInsight } from "@/domain/ai-insight";
import type { CountryCode } from "@/domain/country";

/** Countries that got word for word the same sentence, written once (the first country's order). */
export interface CountryLineGroup {
  readonly countries: readonly CountryCode[];
  readonly sentence: string;
}

/** Groups shown before « Voir les autres pays »; the rest sits behind an expand. */
export const VISIBLE_COUNTRY_GROUPS = 3;

const sentenceKey = (sentence: string): string => sentence.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");

/** Lines with the same sentence (spacing and case aside) become one line listing every country. */
export function groupCountryLines(lines: AiInsight["countries"]): CountryLineGroup[] {
  const groups = new Map<string, { countries: CountryCode[]; sentence: string }>();
  for (const line of lines) {
    const key = sentenceKey(line.sentence);
    const group = groups.get(key);
    if (group) group.countries.push(line.country);
    else groups.set(key, { countries: [line.country], sentence: line.sentence.trim() });
  }
  return [...groups.values()];
}

/** Lowercases the first letter after a colon, unless the word is an acronym (« LED », « USB »). */
export function lowerFirst(text: string): string {
  const [first = "", second = ""] = text;
  return second && second === second.toLocaleUpperCase("fr") && /\p{L}/u.test(second) ? text : `${first.toLocaleLowerCase("fr")}${text.slice(1)}`;
}
