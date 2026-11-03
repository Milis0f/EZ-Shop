import "server-only";
import { getEnv, type ServerEnv } from "@/config/env";
import type { WebPagePrice, WebPriceSummary, WebReading, WebResearchResponse, WebSource } from "@/domain/web";
import type { Locale } from "@/i18n/config";
import { createLimiter } from "@/providers/http";
import { readPagesWithAi, type ReadingDeps } from "./ai-reading";
import { observeHtml, pageText, pageTitle, relevantExcerpt } from "./html-extract";
import { DEFAULT_FETCH_DEPS, fetchRespectingRobots, type FetchDeps } from "./safe-fetch";
import { mergeHits, searchWeb, type SearchDeps, type SearchHit } from "./searxng";
import { median } from "./shop-catalogue";

const HITS_PER_SEARCH = 10;
const MAX_SOURCES = 14;
const PAGES_TO_READ = 6;
/** Pages that refuse or fail leave room for the next ones, up to this many attempts. */
const PAGES_TO_TRY = 10;
const PER_DOMAIN = 2;
const CONCURRENT_PAGES = 3;
/** Fits the model's context (8 192 tokens, about 2.9 characters each) along with the prompt and the answer. */
const EXCERPT_CHARS = 2_400;

/** Added to the search words: what a product researcher wants to find beyond the first answers. */
const ANGLES: Readonly<Record<Locale, readonly string[]>> = {
  en: ["price", "reviews"],
  fr: ["prix", "avis"],
  es: ["precio", "opiniones"],
};

export interface ResearchDeps {
  readonly env: ServerEnv;
  readonly search?: SearchDeps;
  readonly fetch: FetchDeps;
  readonly reading?: ReadingDeps;
  readonly now: () => number;
}

const defaultDeps = (): ResearchDeps => ({ env: getEnv(), fetch: DEFAULT_FETCH_DEPS, now: () => Date.now() });

const domainOf = (url: string): string => new URL(url).hostname.replace(/^www\./, "");

/** Hits to open first: no more than a few pages from one site, the others wait behind. */
function readingOrder(hits: readonly SearchHit[]): SearchHit[] {
  const perDomain = new Map<string, number>();
  const first: SearchHit[] = [];
  const later: SearchHit[] = [];
  for (const hit of hits) {
    const domain = domainOf(hit.url);
    const seen = perDomain.get(domain) ?? 0;
    perDomain.set(domain, seen + 1);
    (seen < PER_DOMAIN ? first : later).push(hit);
  }
  return [...first, ...later];
}

interface ReadPage {
  readonly hit: SearchHit;
  readonly title: string;
  readonly excerpt: string;
  readonly price: WebPagePrice | null;
}

async function readHit(hit: SearchHit, query: string, deps: FetchDeps): Promise<ReadPage | null> {
  const page = await fetchRespectingRobots(hit.url, deps, "text/html,*/*;q=0.5");
  if (!page.ok || !page.contentType.includes("html")) return null;
  const title = pageTitle(page.body) ?? hit.title;
  const observed = observeHtml(page.body);
  return {
    hit,
    title,
    excerpt: relevantExcerpt(pageText(page.body), query, EXCERPT_CHARS),
    price:
      observed.priceMin !== null && observed.priceMin > 0
        ? { url: hit.url, domain: domainOf(hit.url), name: observed.name ?? title, price: observed.priceMin, currency: observed.currency, rating: observed.rating, reviewCount: observed.reviewCount }
        : null,
  };
}

/**
 * A page's own product data beats the model's reading of its text, which can pick a crossed-out price.
 * A price in a chart that contradicts the price its page declares goes, and the chart with it if too thin.
 */
export function withoutContradictedPrices(reading: WebReading, declared: ReadonlyArray<WebPagePrice | null>): WebReading {
  if (!reading.summary) return reading;
  const charts = reading.summary.charts.flatMap((chart) => {
    if (!/[€$£]|eur|usd|gbp/i.test(chart.unit)) return [chart];
    const points = chart.points.filter((point) => {
      const own = declared[point.source - 1];
      return !own || own.price === point.value;
    });
    return points.length >= 2 ? [{ ...chart, points }] : [];
  });
  return { ...reading, summary: { ...reading.summary, charts } };
}

/** Lowest, median and highest of the prices in the most frequent currency. Two prices at least. */
export function summarisePrices(prices: readonly WebPagePrice[]): WebPriceSummary | null {
  const byCurrency = new Map<string, number[]>();
  for (const { currency, price } of prices) {
    if (currency) byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), price]);
  }
  const [currency, values] = [...byCurrency].sort((a, b) => b[1].length - a[1].length)[0] ?? [];
  if (!currency || !values || values.length < 2) return null;
  return { currency, count: values.length, min: Math.min(...values), median: median(values) ?? 0, max: Math.max(...values) };
}

export async function runWebResearch(query: string, locale: Locale, overrides: Partial<ResearchDeps> = {}): Promise<WebResearchResponse> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  // The first search alone: it starts the local engine if needed, and its failure is the answer.
  const found = await searchWeb(query, locale, HITS_PER_SEARCH, deps.env, deps.search);
  if (!found.ok) return { status: "unavailable", code: found.code };
  const angles = await Promise.all(ANGLES[locale].map((angle) => searchWeb(`${query} ${angle}`, locale, HITS_PER_SEARCH, deps.env, deps.search)));
  const hits = mergeHits([found.hits, ...angles.flatMap((angle) => (angle.ok ? [angle.hits] : []))]);

  const limit = createLimiter(CONCURRENT_PAGES);
  const toTry = readingOrder(hits).slice(0, PAGES_TO_TRY);
  const attempts = await Promise.all(toTry.map((hit) => limit(() => readHit(hit, query, deps.fetch))));
  const pages = attempts.filter((page): page is ReadPage => page !== null).slice(0, PAGES_TO_READ);

  const readUrls = new Set(pages.map((page) => page.hit.url));
  const others = hits.filter((hit) => !readUrls.has(hit.url)).map((hit): WebSource => ({ ...hit, read: false }));
  const sources = [...pages.map((page): WebSource => ({ url: page.hit.url, title: page.title, snippet: page.hit.snippet, read: true })), ...others].slice(0, MAX_SOURCES);
  const prices = pages.flatMap((page) => (page.price ? [page.price] : []));

  // Without a readable page the AI gets the excerpts of the search, numbered like the sources.
  const material = pages.length ? pages.map((page) => `${page.title}\n${page.price ? `Price in the page's product data: ${page.price.price} ${page.price.currency ?? ""}\n` : ""}${page.excerpt}`) : sources.slice(0, PAGES_TO_READ).map((source) => `${source.title}\n${source.snippet}`);
  const reading = withoutContradictedPrices(await readPagesWithAi(query, material, locale, deps.reading), pages.map((page) => page.price));
  return { status: "ready", query, sources, prices, priceSummary: summarisePrices(prices), reading, durationMs: Math.round(deps.now() - started) };
}
