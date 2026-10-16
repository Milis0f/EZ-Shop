import { createHash } from "node:crypto";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import { fail, ok, type ProviderErrorCode, type ProviderResult } from "./contracts";

/** Shared HTTP layer: timeout, bounded retry on transient errors, typed failures. */

export const USER_AGENT = "EZ-Shop/0.1 (+pre-launch product research; country-level statistics)";

export interface HttpOptions {
  readonly timeoutMs: number;
  readonly method?: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Total attempts for retryable failures (5xx, timeout, network). */
  readonly attempts?: number;
  /**
   * Reads an error body and returns the API's own error code (e.g. "invalid_grant"), added to the message.
   * Must return a short code only, never free text from the body.
   */
  readonly describeError?: (status: number, body: string) => ErrorDescription | undefined;
}

export interface ErrorDescription {
  readonly reason: string;
  /** Overrides the code derived from the HTTP status. */
  readonly code?: ProviderErrorCode;
}

/** Error codes are identifiers: anything else is dropped rather than echoed into messages. */
const SAFE_REASON = /^[A-Za-z][A-Za-z0-9_.]{1,63}$/;

function codeForStatus(status: number): { code: ProviderErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: "unauthorized", retryable: false };
  if (status === 404) return { code: "no_data", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  return { code: "upstream_error", retryable: status >= 500 };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a URL as text. `label` is what appears in error messages: it must never
 * contain credentials (tokens are often passed in query strings).
 */
export async function httpText(url: string, label: string, options: HttpOptions): Promise<ProviderResult<string>> {
  const attempts = Math.max(1, options.attempts ?? 2);
  let last: ProviderResult<string> = fail("upstream_error", `${label}: no attempt made`);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: { "User-Agent": USER_AGENT, ...options.headers },
        body: options.body,
        signal: AbortSignal.timeout(options.timeoutMs),
        cache: "no-store",
      });
      if (response.ok) return ok(await response.text());
      const { code, retryable } = codeForStatus(response.status);
      const described = options.describeError?.(response.status, await response.text().catch(() => ""));
      const reason = described && SAFE_REASON.test(described.reason) ? described.reason : undefined;
      last = fail(described?.code ?? code, `${label}: HTTP ${response.status}${reason ? ` (${reason})` : ""}`, retryable);
      if (!retryable) return last;
    } catch (error: unknown) {
      const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      last = fail(isTimeout ? "timeout" : "upstream_error", `${label}: ${isTimeout ? "timeout" : "network error"}`, true);
    }
    // Throttling (429) needs a longer pause than a transient server error.
    if (attempt < attempts) await sleep((!last.ok && last.error.code === "rate_limited" ? 1200 : 400) * attempt);
  }
  return last;
}

export async function httpJson(url: string, label: string, options: HttpOptions): Promise<ProviderResult<unknown>> {
  const text = await httpText(url, label, options);
  if (!text.ok) return text;
  try {
    return ok(JSON.parse(text.data) as unknown);
  } catch {
    return fail("invalid_response", `${label}: response is not valid JSON`);
  }
}

/**
 * At most `max` calls of a provider in flight: open APIs (Wikimedia…) throttle bursts with HTTP 429,
 * and an analysis of 18 countries would otherwise fire dozens of requests at once.
 */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

export const cacheKey = (providerId: string, request: string): string =>
  `${providerId}:${createHash("sha256").update(request).digest("hex").slice(0, 32)}`;

/**
 * Cache-aside for public, slow-moving sources. Only raw payloads that `isValid` accepts are
 * cached, so an error envelope returned with HTTP 200 (quota warning, `error_response`…) is never
 * kept for days. `isValid` means "the expected shape, without an error envelope": a well-formed
 * empty answer stays cacheable. A cached entry that fails it counts as a miss and is overwritten by
 * the next valid answer. An invalid payload loaded from the network is still returned, so the
 * adapter's own parser reports the error. Failures are always retried on the next analysis.
 */
export async function cached<T>(
  cache: ProviderCacheRepository,
  key: string,
  providerId: string,
  ttlSeconds: number,
  load: () => Promise<ProviderResult<T>>,
  isValid: (payload: T) => boolean,
): Promise<ProviderResult<T> & { fromCache?: boolean }> {
  const hit = await cache.get(key);
  if (hit !== null && isValid(hit as T)) return { ok: true, data: hit as T, fromCache: true };
  const result = await load();
  if (result.ok && isValid(result.data)) await cache.set(key, providerId, result.data, ttlSeconds);
  return result;
}
