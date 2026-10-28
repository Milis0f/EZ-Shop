import { COUNTRIES, type CountryCode } from "@/domain/country";
import { ORIGIN_COUNTRIES } from "@/domain/origin";
import { MONTH_LABELS_FR } from "@/domain/time";
import { countryName } from "@/engine/report/localize";
import type { Locale } from "@/i18n/config";
import { formatDecimal, formatMoney, formatNumber } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import { monthLong, originCountryName } from "./labels";

/**
 * Free text written in French by the engine and the connectors (criterion rules, confidence notes,
 * DATA_INSUFFICIENT reasons, tax notes, collection incidents), shown in the active locale.
 *
 * The French entries of the `engine` dictionary are the exact engine strings: each one is turned
 * into a pattern, its {placeholders} are captured and re-rendered in the English or Spanish entry
 * (numbers, money, months and country names follow the locale). French returns the text untouched,
 * and a text no pattern knows is shown as stored rather than guessed.
 */

type EngineKey = keyof ReturnType<typeof engineMessages>;

const engineMessages = (locale: Locale) => messagesFor("analysisAdvanced", locale).engine;

/** Params holding a number written the French way ("-12,2", "1 000"). */
const NUMERIC = new Set(["value", "growth", "index", "pct", "rate", "min", "max", "coverage", "required", "r", "target", "total", "intent", "first", "count"]);
/** Params holding an amount, with their currency. */
const MONEY: Readonly<Record<string, string>> = { eur: "EUR", eurLimit: "EUR", gbp: "GBP" };
/** Params that are themselves engine text. */
const NESTED = new Set(["reason", "label"]);

const NUMBER_RE = "([+\\-−]?\\d[\\d \\u00a0\\u202f]*(?:[.,]\\d+)?)";

const normalize = (s: string): string => s.replace(/[  ]/g, " ").trim();
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface Pattern {
  readonly key: EngineKey;
  readonly re: RegExp;
  readonly names: readonly string[];
}

let patterns: readonly Pattern[] | null = null;

/** One pattern per French entry ("…One" plural variants share their base pattern). */
function getPatterns(): readonly Pattern[] {
  if (patterns) return patterns;
  const fr = engineMessages("fr");
  patterns = (Object.keys(fr) as EngineKey[])
    .filter((key) => !key.endsWith("One"))
    .map((key) => {
      const names: string[] = [];
      const source = normalize(fr[key])
        .split(/(\{\w+\})/g)
        .map((part) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          if (!name) return escape(part);
          names.push(name);
          return NUMERIC.has(name) || name in MONEY ? NUMBER_RE : "(.+?)";
        })
        .join("");
      return { key, re: new RegExp(`^${source}$`), names };
    })
    // Fixed sentences first, then the most specific patterns (longest literal text).
    .toSorted((a, b) => a.names.length - b.names.length || b.re.source.length - a.re.source.length);
  return patterns;
}

const parseNumber = (raw: string): number | null => {
  const n = Number(raw.replace(/[   ]/g, "").replace("−", "-").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const FR_COUNTRY = new Map(Object.values(COUNTRIES).map((c) => [c.nameFr, c.code as CountryCode]));
const FR_ORIGIN = new Map(ORIGIN_COUNTRIES.map((o) => [o.nameFr as string, o.code]));

function renderParam(name: string, raw: string, locale: Locale): string {
  if (name in MONEY) {
    const n = parseNumber(raw);
    return n === null ? raw : formatMoney(n, locale, MONEY[name]);
  }
  if (NUMERIC.has(name)) {
    const n = parseNumber(raw);
    if (n === null) return raw;
    // A correlation keeps its two decimals; other figures use the usual one.
    const text = name === "r" ? formatNumber(n, locale, { maximumFractionDigits: 2 }) : formatDecimal(n, locale);
    return `${raw.startsWith("+") ? "+" : ""}${text}`;
  }
  if (NESTED.has(name)) return engineText(raw, locale);
  if (name === "month") {
    const index = MONTH_LABELS_FR.indexOf(raw as (typeof MONTH_LABELS_FR)[number]);
    return index < 0 ? raw : monthLong(index + 1, locale);
  }
  if (name === "country") {
    const code = FR_COUNTRY.get(raw);
    return code ? countryName(code, locale) : raw;
  }
  if (name === "origin") {
    const code = FR_ORIGIN.get(raw);
    return code ? originCountryName(code, locale) : raw;
  }
  return raw;
}

function translateOne(text: string, locale: Locale): string | null {
  const m = engineMessages(locale);
  for (const p of getPatterns()) {
    const match = p.re.exec(text);
    if (!match) continue;
    const params: Record<string, string> = {};
    p.names.forEach((name, i) => (params[name] = renderParam(name, match[i + 1] ?? "", locale)));
    const one = `${p.key}One` as EngineKey;
    const count = p.names.includes("count") ? parseNumber(match[p.names.indexOf("count") + 1] ?? "") : null;
    return t(count === 1 && one in m ? m[one] : m[p.key], params);
  }
  return null;
}

/** The engine text in the locale: whole text first, else sentence by sentence; unknown text stays as stored. */
export function engineText(text: string, locale: Locale): string {
  if (locale === "fr" || text === "") return text;
  const clean = normalize(text);
  const whole = translateOne(clean, locale);
  if (whole !== null) return whole;
  const sentences = clean.split(/(?<=\.)\s+/);
  if (sentences.length < 2) return text;
  return sentences.map((s) => translateOne(s, locale) ?? s).join(" ");
}
