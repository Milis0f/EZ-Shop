/**
 * Number guard for AI text: every number the model writes must already exist in the fact sheet it
 * was given. Both sides go through the same extraction and normalisation, so "1 234", "1 234"
 * (narrow no-break space) and "1234" are the same number, and "12,2 %", "12.2" and "−12,2" share
 * the value 12.2.
 *
 * Rules:
 * - A sign counts only at the start of a number that does not follow a letter or a digit
 *   ("P10-P90" and "2026-10" hold no negative number).
 * - Comma and dot are decimal separators. A dot is read as a thousands separator only in the
 *   unambiguous form "1.234.567" (two groups or more). Thousands may also be grouped with a
 *   space, a no-break space, a narrow no-break space or a thin space.
 * - Digits glued to letters still count ("P50" holds 50, "1er" holds 1): nothing is skipped.
 * - A signed number is refused when the facts only hold the opposite sign (a flipped trend).
 */

/** Spaces used as thousands separators: space, no-break space, narrow no-break space, thin space. */
const GROUP_SPACE = "[ \\u00A0\\u202F\\u2009]";
const MINUS_SIGNS = new Set(["-", "−"]);

const NUMBER_PATTERN = new RegExp(
  [
    // Optional sign, only when it does not follow a letter or a digit.
    "(?:(?<![\\p{L}\\p{N}])([+\\-\\u2212]))?",
    "(?<!\\p{N})",
    "(",
    // Grouped forms never start right after a letter: "P50 340" is two numbers, not 50 340.
    // 1.234.567 (two dot groups or more), then an optional comma decimal part.
    "(?<!\\p{L})\\d{1,3}(?:\\.\\d{3}){2,}(?:,\\d+)?",
    "|",
    // 1 234 567 grouped with spaces, then an optional decimal part.
    `(?<!\\p{L})\\d{1,3}(?:${GROUP_SPACE}\\d{3})+(?:[.,]\\d+)?`,
    "|",
    // Plain integer or decimal.
    "\\d+(?:[.,]\\d+)?",
    ")",
    "(?!\\p{N})",
  ].join(""),
  "gu",
);

export interface NumberToken {
  /** The number as written (sign included). */
  readonly raw: string;
  /** Canonical absolute value, e.g. "12.2", "1234", "0.5". */
  readonly value: string;
  /** Explicit sign, when one was written and the value is not zero. */
  readonly sign: "+" | "-" | null;
}

function canonical(digits: string, dotIsGrouping: boolean): string | null {
  let text = digits.replace(new RegExp(GROUP_SPACE, "gu"), "");
  if (dotIsGrouping) text = text.replace(/\./g, "");
  const value = Number(text.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  return String(Math.round(value * 1e6) / 1e6);
}

/** Every number written in `text`, in order. */
export function extractNumbers(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.normalize("NFC").matchAll(NUMBER_PATTERN)) {
    const signChar = match[1];
    const digits = match[2];
    if (digits === undefined) continue;
    const dotIsGrouping = /^\d{1,3}(?:\.\d{3}){2,}/.test(digits);
    const value = canonical(digits, dotIsGrouping);
    if (value === null) continue;
    const sign = signChar === undefined || value === "0" ? null : MINUS_SIGNS.has(signChar) ? "-" : "+";
    tokens.push({ raw: `${signChar ?? ""}${digits}`, value, sign });
  }
  return tokens;
}

/**
 * Normalised numbers of a text, to be used as the `allowed` set of `findUnsupportedNumbers`:
 * the absolute value of every number, plus its signed form when a sign was written.
 */
export function collectNumbers(text: string): Set<string> {
  const numbers = new Set<string>();
  for (const token of extractNumbers(text)) {
    numbers.add(token.value);
    if (token.sign) numbers.add(`${token.sign}${token.value}`);
  }
  return numbers;
}

/** Numbers of `text` (as written, without duplicates) that `allowed` does not hold. */
export function findUnsupportedNumbers(text: string, allowed: ReadonlySet<string>): string[] {
  const unsupported: string[] = [];
  for (const token of extractNumbers(text)) {
    const opposite = token.sign === "-" ? "+" : "-";
    const supported =
      allowed.has(token.value) &&
      (token.sign === null || allowed.has(`${token.sign}${token.value}`) || !allowed.has(`${opposite}${token.value}`));
    if (!supported && !unsupported.includes(token.raw)) unsupported.push(token.raw);
  }
  return unsupported;
}
