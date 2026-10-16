/** Calendar helpers on `YYYY-MM` strings (UTC, no timezone drift). */

export type YearMonth = string;

const YM_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isYearMonth(value: string): value is YearMonth {
  return YM_PATTERN.test(value);
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const match = YM_PATTERN.exec(ym);
  if (!match) throw new Error(`Invalid YearMonth: ${ym}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function toYearMonth(date: Date): YearMonth {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const index = year * 12 + (month - 1) + delta;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Number of months from `a` to `b` (positive if b is after a). */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

/** Inclusive list of months from `from` to `to`. */
export function monthRange(from: YearMonth, to: YearMonth): YearMonth[] {
  const length = monthsBetween(from, to) + 1;
  return Array.from({ length: Math.max(0, length) }, (_, i) => addMonths(from, i));
}

/** Month of year, 1–12. */
export const monthOfYear = (ym: YearMonth): number => parseYearMonth(ym).month;

/** Last fully elapsed month relative to `now`. */
export const lastCompleteMonth = (now: Date): YearMonth => addMonths(toYearMonth(now), -1);

export const MONTH_LABELS_FR = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
] as const;
