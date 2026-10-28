/**
 * Number guard for AI text: every number the model writes must already exist among the VALUES of the
 * fact sheet it was given. Both sides go through the same normalisation and extraction, so "1 234",
 * "1 234" (narrow no-break space), full-width "１２３４" and "1234" are the same number, and
 * "12,2 %", "12.2" and "−12,2" share the value 12.2.
 *
 * Rules:
 * - Text is NFKC-normalised first: full-width, mathematical, circled and superscript digits become
 *   ASCII, "½" becomes "1⁄2". Any numeral still outside ASCII 0-9 after that (Arabic-Indic,
 *   Devanagari…) is refused as such: the guard cannot read it, so it cannot vouch for it.
 * - A sign counts only at the start of a number that does not follow a letter or a digit
 *   ("P10-P90" and "2026-10" hold no negative number). Hyphen, minus and the Unicode dashes count.
 * - Separators follow the locale of the reading, and both sides (fact sheet and AI text) must be read
 *   with the same locale. Unambiguous forms read the same everywhere: "1,234.5" and "1.234,5" are
 *   1234.5, "1,234,567" and "1.234.567" are 1234567, and a thousands space is grouping ("1 234,5"
 *   and "1 234.5" are 1234.5). A lone separator after one to three digits and before exactly three
 *   ("1,234", "1.234") is grouping only where the locale writes thousands that way: the comma in
 *   English, the dot in Spanish (es-ES writes 12.345). Anywhere else a lone comma or dot is a
 *   decimal separator, so "12,2" and "12.2" are 12.2 in every locale.
 * - Thousands may also be grouped with a space, a no-break space, a narrow no-break space, a thin
 *   space or a figure space.
 * - Digits glued to letters still count ("1er" holds 1): nothing is skipped.
 * - A signed number is refused when the facts only hold the opposite sign (a flipped trend).
 * - In AI text only, a few fixed labels carry no claim and are ignored, in English, French and
 *   Spanish alike: the percentile names P10 / P50 / P90, the scale right after a number ("sur 100",
 *   "out of 100", "sobre 100", "/100"), the windows the analysis is computed on ("12 derniers
 *   mois", "last 12 months", "últimos 12 meses" and their "next" forms), and the index range
 *   ("de 0 à 100", "from 0 to 100", "de 0 a 100").
 *
 * Known limit: only numerals are read. Quantities written as words ("trois pays", "twice as many",
 * "la mitad", "un million") pass unchecked. Refusing them outright would reject honest phrasing
 * such as "les deux pays analysés", so the prompt asks for digits and this limit is accepted.
 */

import type { Locale } from "@/i18n/config";

/** French rules (the guard's only language before i18n) when no locale is given. */
const DEFAULT_GUARD_LOCALE: Locale = "fr";

/** The lone separator read as grouping before exactly three digits ("1,234" in English, "1.234" in Spanish). */
const LONE_GROUPING: Readonly<Record<Locale, "," | "." | null>> = { en: ",", fr: null, es: "." };

/** Spaces used as thousands separators: space, no-break space, narrow no-break space, thin space, figure space. */
const GROUP_SPACE = String.raw`[     ]`;
/** Hyphen-minus, minus sign, hyphen, non-breaking hyphen, figure dash, en dash. */
const MINUS_CHARS = String.raw`\-−‐‑‒–`;
const MINUS_SIGN = new RegExp(`^[${MINUS_CHARS}]$`, "u");
/** Spaces allowed inside the fixed labels. */
const SP = String.raw`[   ]`;

const NUMBER_PATTERN = new RegExp(
  [
    // Optional sign, only when it does not follow a letter or a digit.
    String.raw`(?:(?<![\p{L}\p{N}])([+${MINUS_CHARS}]))?`,
    String.raw`(?<!\p{N})`,
    "(",
    // Grouped forms never start right after a letter: "P50 340" is two numbers, not 50 340.
    // 1,234.5 and 1.234,5: both separators, the last one is the decimal one.
    String.raw`(?<!\p{L})\d{1,3}(?:,\d{3})+\.\d+`,
    "|",
    String.raw`(?<!\p{L})\d{1,3}(?:\.\d{3})+,\d+`,
    "|",
    // 1,234,567 and 1.234.567 (two groups or more).
    String.raw`(?<!\p{L})\d{1,3}(?:,\d{3}){2,}`,
    "|",
    String.raw`(?<!\p{L})\d{1,3}(?:\.\d{3}){2,}`,
    "|",
    // 1 234 567 grouped with spaces, then an optional decimal part.
    String.raw`(?<!\p{L})\d{1,3}(?:${GROUP_SPACE}\d{3})+(?:[.,]\d+)?`,
    "|",
    // Plain integer or decimal; `canonical` reads a lone separator with the locale.
    String.raw`\d+(?:[.,]\d+)?`,
    ")",
    String.raw`(?!\p{N})`,
  ].join(""),
  "gu",
);

/** Numerals the extraction cannot read (after NFKC): anything numeric outside ASCII 0-9. */
const FOREIGN_NUMERAL = /[^\P{N}0-9]+/gu;

/** Labels of AI text that hold digits but no claim (see the rules above), in every interface language. */
const LABEL_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`(?<![\p{L}\p{N}])P(?:10|50|90)(?![\p{L}\p{N}])`, "gu"),
  new RegExp(String.raw`(?<=\p{N}${SP}?(?:%${SP}?)?)(?:(?:sur|sobre|out${SP}+of)${SP}+|\/${SP}?)100(?![.,]?\p{N})`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])12${SP}+(?:derniers|prochains)${SP}+mois`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:last|next|past)${SP}+12${SP}+months`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:últimos|próximos)${SP}+12${SP}+meses`, "giu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:de${SP}+0${SP}+[àa]|from${SP}+0${SP}+to)${SP}+100(?![.,]?\p{N})`, "giu"),
];

export interface NumberToken {
  /** The number as written (sign included), after normalisation. */
  readonly raw: string;
  /** Canonical absolute value, e.g. "12.2", "1234", "0.5". */
  readonly value: string;
  /** Explicit sign, when one was written and the value is not zero. */
  readonly sign: "+" | "-" | null;
}

/** NFKC: full-width, mathematical, circled and superscript digits (and full-width signs) become ASCII. */
export function normaliseNumerals(text: string): string {
  return text.normalize("NFKC");
}

/** Plain digits with at most one "." as the decimal point, from matched digits read with the rules of `locale`. */
function plainDigits(text: string, locale: Locale): string {
  const separators = text.match(/[.,]/g) ?? [];
  if (separators.length === 0) return text;
  if (new Set(separators).size === 2) {
    // Both kinds: the last separator is the decimal one, the other one is grouping.
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    const grouping = decimal === "." ? "," : ".";
    return text.split(grouping).join("").replace(decimal, ".");
  }
  // The same separator twice or more is grouping ("1,234,567", "1.234.567").
  if (separators.length > 1) return text.replace(/[.,]/g, "");
  const lone = separators[0] ?? ".";
  const grouping = lone === LONE_GROUPING[locale] && /^\d{1,3}[.,]\d{3}$/.test(text);
  return grouping ? text.replace(lone, "") : text.replace(lone, ".");
}

function canonical(digits: string, locale: Locale): string | null {
  const value = Number(plainDigits(digits.replace(new RegExp(GROUP_SPACE, "gu"), ""), locale));
  if (!Number.isFinite(value)) return null;
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * Every number written in `text`, in order, read with the separators of `locale` (French rules by
 * default). Numerals outside ASCII after NFKC are not read here (see `findUnsupportedNumbers`).
 */
export function extractNumbers(text: string, locale: Locale = DEFAULT_GUARD_LOCALE): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of normaliseNumerals(text).matchAll(NUMBER_PATTERN)) {
    const signChar = match[1];
    const digits = match[2];
    if (digits === undefined) continue;
    const value = canonical(digits, locale);
    if (value === null) continue;
    const sign = signChar === undefined || value === "0" ? null : MINUS_SIGN.test(signChar) ? "-" : "+";
    tokens.push({ raw: `${signChar ?? ""}${digits}`, value, sign });
  }
  return tokens;
}

/**
 * Normalised numbers of fact values, to be used as the `allowed` set of `findUnsupportedNumbers`:
 * the absolute value of every number, plus its signed form when a sign was written. Pass value
 * fragments only (never labels, scales or dates): every number found here becomes citable.
 */
export function collectNumbers(...fragments: readonly string[]): Set<string> {
  return collectNumbersFor(DEFAULT_GUARD_LOCALE, fragments);
}

/** `collectNumbers` with the separator rules of `locale`, the language the fact sheet was written in. */
export function collectNumbersFor(locale: Locale, fragments: readonly string[]): Set<string> {
  const numbers = new Set<string>();
  for (const fragment of fragments) {
    for (const token of extractNumbers(fragment, locale)) {
      numbers.add(token.value);
      if (token.sign) numbers.add(`${token.sign}${token.value}`);
    }
  }
  return numbers;
}

/** AI text without the fixed labels that hold digits but no claim. */
function withoutLabels(text: string): string {
  return LABEL_PATTERNS.reduce((t, pattern) => t.replace(pattern, " "), normaliseNumerals(text));
}

/**
 * Numbers of AI `text` (as written after normalisation, without duplicates) that `allowed` does not
 * hold, plus every numeral the guard cannot read. `locale` must be the one `allowed` was collected with.
 */
export function findUnsupportedNumbers(text: string, allowed: ReadonlySet<string>, locale: Locale = DEFAULT_GUARD_LOCALE): string[] {
  const checked = withoutLabels(text);
  const unsupported: string[] = [...new Set(checked.match(FOREIGN_NUMERAL) ?? [])];
  for (const token of extractNumbers(checked, locale)) {
    const opposite = token.sign === "-" ? "+" : "-";
    const supported =
      allowed.has(token.value) &&
      (token.sign === null || allowed.has(`${token.sign}${token.value}`) || !allowed.has(`${opposite}${token.value}`));
    if (!supported && !unsupported.includes(token.raw)) unsupported.push(token.raw);
  }
  return unsupported;
}
