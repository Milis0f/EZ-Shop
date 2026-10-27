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
 * - Comma and dot are decimal separators. A dot is read as a thousands separator only in the
 *   unambiguous form "1.234.567" (two groups or more). Thousands may also be grouped with a
 *   space, a no-break space, a narrow no-break space, a thin space or a figure space.
 * - Digits glued to letters still count ("1er" holds 1): nothing is skipped.
 * - A signed number is refused when the facts only hold the opposite sign (a flipped trend).
 * - In AI text only, a few fixed labels carry no claim and are ignored: the percentile names
 *   P10 / P50 / P90, the scale "sur 100" or "/100" right after a number, the windows
 *   "12 derniers mois" / "12 prochains mois" the analysis is computed on, and the index range
 *   "de 0 à 100".
 */

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
    // 1.234.567 (two dot groups or more), then an optional comma decimal part.
    String.raw`(?<!\p{L})\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?`,
    "|",
    // 1 234 567 grouped with spaces, then an optional decimal part.
    String.raw`(?<!\p{L})\d{1,3}(?:${GROUP_SPACE}\d{3})+(?:[.,]\d+)?`,
    "|",
    // Plain integer or decimal.
    String.raw`\d+(?:[.,]\d+)?`,
    ")",
    String.raw`(?!\p{N})`,
  ].join(""),
  "gu",
);

/** Numerals the extraction cannot read (after NFKC): anything numeric outside ASCII 0-9. */
const FOREIGN_NUMERAL = /[^\P{N}0-9]+/gu;

/** Labels of AI text that hold digits but no claim (see the rules above). */
const LABEL_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`(?<![\p{L}\p{N}])P(?:10|50|90)(?![\p{L}\p{N}])`, "gu"),
  new RegExp(String.raw`(?<=\p{N}${SP}?(?:%${SP}?)?)(?:sur${SP}+|\/${SP}?)100(?![.,]?\p{N})`, "gu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])12${SP}+(?:derniers|prochains)${SP}+mois`, "gu"),
  new RegExp(String.raw`(?<![\p{L}\p{N}])de${SP}+0${SP}+à${SP}+100(?![.,]?\p{N})`, "gu"),
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

function canonical(digits: string, dotIsGrouping: boolean): string | null {
  let text = digits.replace(new RegExp(GROUP_SPACE, "gu"), "");
  if (dotIsGrouping) text = text.replace(/\./g, "");
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return String(Math.round(value * 1e6) / 1e6);
}

/** Every number written in `text`, in order. Numerals outside ASCII after NFKC are not read here (see `findUnsupportedNumbers`). */
export function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of normaliseNumerals(text).matchAll(NUMBER_PATTERN)) {
    const signChar = match[1];
    const digits = match[2];
    if (digits === undefined) continue;
    const dotIsGrouping = /^\d{1,3}(?:\.\d{3}){2,}/.test(digits);
    const value = canonical(digits, dotIsGrouping);
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
  const numbers = new Set<string>();
  for (const fragment of fragments) {
    for (const token of extractNumbers(fragment)) {
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
 * hold, plus every numeral the guard cannot read.
 */
export function findUnsupportedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  const checked = withoutLabels(text);
  const unsupported: string[] = [...new Set(checked.match(FOREIGN_NUMERAL) ?? [])];
  for (const token of extractNumbers(checked)) {
    const opposite = token.sign === "-" ? "+" : "-";
    const supported =
      allowed.has(token.value) &&
      (token.sign === null || allowed.has(`${token.sign}${token.value}`) || !allowed.has(`${opposite}${token.value}`));
    if (!supported && !unsupported.includes(token.raw)) unsupported.push(token.raw);
  }
  return unsupported;
}
