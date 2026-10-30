import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import type { ServerEnv } from "@/config/env";
import type { WebSearchFailure } from "@/domain/web";
import type { Locale } from "@/i18n/config";

/**
 * Web search through a SearXNG running on this machine (free, open source, no key, no quota).
 * Only the search words leave the computer, towards the engines SearXNG asks.
 */

const SEARCH_TIMEOUT_MS = 15_000;
const HEALTH_TIMEOUT_MS = 1_500;
const START_WAIT_MS = 25_000;
const POLL_MS = 1_000;

const resultSchema = z.object({
  url: z.string(),
  title: z.string().default(""),
  content: z.string().nullish(),
});
const responseSchema = z.object({ results: z.array(z.unknown()) });

export interface SearchHit {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
}

/** Well-formed http(s) hits, duplicates dropped, in SearXNG's order. */
export function parseSearchResponse(payload: unknown, limit: number): SearchHit[] | null {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const raw of parsed.data.results) {
    const result = resultSchema.safeParse(raw);
    if (!result.success || !/^https?:\/\//i.test(result.data.url) || !URL.canParse(result.data.url) || seen.has(result.data.url)) continue;
    seen.add(result.data.url);
    hits.push({ url: result.data.url, title: result.data.title, snippet: result.data.content ?? "" });
    if (hits.length >= limit) break;
  }
  return hits;
}

const isLoopback = (url: string): boolean => URL.canParse(url) && ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);

async function isUp(baseUrl: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

function launch(): void {
  // Fixed command, no visitor input. It outlives the request and stops with WSL or the machine.
  const script = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "scripts", "searxng.mjs");
  const child = spawn(process.execPath, [script, "start"], { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", () => undefined);
  child.unref();
}

export interface SearchDeps {
  readonly fetch: typeof fetch;
  readonly launch: () => void;
  readonly sleep: (ms: number) => Promise<void>;
}

const DEFAULT_DEPS: SearchDeps = {
  fetch: (input, init) => fetch(input, init),
  launch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Starts the local SearXNG when it is down. False when it does not come up (usually: not installed). */
export async function ensureSearxng(env: ServerEnv, deps: SearchDeps = DEFAULT_DEPS): Promise<boolean> {
  const baseUrl = env.SEARXNG_URL;
  if (await isUp(baseUrl, deps.fetch)) return true;
  if (!env.SEARXNG_AUTOSTART || !isLoopback(baseUrl)) return false;
  deps.launch();
  for (let waited = 0; waited < START_WAIT_MS; waited += POLL_MS) {
    await deps.sleep(POLL_MS);
    if (await isUp(baseUrl, deps.fetch)) return true;
  }
  return false;
}

export type SearchResult = { readonly ok: true; readonly hits: readonly SearchHit[] } | { readonly ok: false; readonly code: WebSearchFailure };

export async function searchWeb(query: string, locale: Locale, limit: number, env: ServerEnv, deps: SearchDeps = DEFAULT_DEPS): Promise<SearchResult> {
  if (!(await ensureSearxng(env, deps))) return { ok: false, code: "search_not_installed" };
  const params = new URLSearchParams({ q: query, format: "json", language: locale, safesearch: "0" });
  try {
    const response = await deps.fetch(`${env.SEARXNG_URL}/search?${params}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return { ok: false, code: "search_failed" };
    const hits = parseSearchResponse(await response.json(), limit);
    if (!hits) return { ok: false, code: "search_failed" };
    return hits.length ? { ok: true, hits } : { ok: false, code: "no_results" };
  } catch {
    return { ok: false, code: "search_failed" };
  }
}
