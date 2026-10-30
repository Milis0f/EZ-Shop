import "server-only";
import { getEnv, type ServerEnv } from "@/config/env";
import type { WebResearchResponse, WebSource } from "@/domain/web";
import type { Locale } from "@/i18n/config";
import { createLimiter } from "@/providers/http";
import { readWithAi, type ReadingDeps } from "./ai-reading";
import { pageText, pageTitle } from "./html-extract";
import { DEFAULT_FETCH_DEPS, fetchRespectingRobots, type FetchDeps } from "./safe-fetch";
import { searchWeb, type SearchDeps, type SearchHit } from "./searxng";

const HITS = 8;
const PAGES_TO_READ = 4;
const CONCURRENT_PAGES = 3;
/** Fits the model's context (8 192 tokens) along with the prompt and the answer. */
const EXCERPT_CHARS = 2_500;

export interface ResearchDeps {
  readonly env: ServerEnv;
  readonly search?: SearchDeps;
  readonly fetch: FetchDeps;
  readonly reading?: ReadingDeps;
  readonly now: () => number;
}

const defaultDeps = (): ResearchDeps => ({ env: getEnv(), fetch: DEFAULT_FETCH_DEPS, now: () => Date.now() });

interface ReadPage {
  readonly source: WebSource;
  readonly excerpt: string | null;
}

async function readHit(hit: SearchHit, deps: FetchDeps): Promise<ReadPage> {
  const page = await fetchRespectingRobots(hit.url, deps, "text/html,*/*;q=0.5");
  if (!page.ok || !page.contentType.includes("html")) return { source: { ...hit, read: false }, excerpt: null };
  return {
    source: { url: hit.url, title: pageTitle(page.body) ?? hit.title, snippet: hit.snippet, read: true },
    excerpt: pageText(page.body).slice(0, EXCERPT_CHARS),
  };
}

export async function runWebResearch(query: string, locale: Locale, overrides: Partial<ResearchDeps> = {}): Promise<WebResearchResponse> {
  const deps = { ...defaultDeps(), ...overrides };
  const started = deps.now();
  const found = await searchWeb(query, locale, HITS, deps.env, deps.search);
  if (!found.ok) return { status: "unavailable", code: found.code };

  const limit = createLimiter(CONCURRENT_PAGES);
  const toRead = found.hits.slice(0, PAGES_TO_READ);
  const pages = await Promise.all(toRead.map((hit) => limit(() => readHit(hit, deps.fetch))));
  const others = found.hits.slice(PAGES_TO_READ).map((hit): WebSource => ({ ...hit, read: false }));
  const sources = [...pages.map((p) => p.source), ...others];

  const material = pages.map((p, i) => `[${i + 1}] ${p.source.title}\n${p.excerpt ?? p.source.snippet}`).join("\n\n");
  const reading = await readWithAi(`Search: ${query}`, material, locale, deps.reading);
  return { status: "ready", query, sources, reading, durationMs: Math.round(deps.now() - started) };
}
