import { aiInsightResponseSchema, type AiInsightResponse } from "@/domain/ai-insight";
import type { Locale } from "@/i18n/config";

/**
 * Client store of the local AI reading, one entry per analysis. The simple and advanced views of a
 * page are both mounted (CSS hides one), so they read the same entry: one request, one outcome, and
 * a retry from either view updates both. The request is aborted once nobody listens any more.
 * Entries are kept per language too: after a language switch the page asks for the reading in the
 * new language (the server reads the ez-locale cookie the switcher just set).
 */

export type ReadyResponse = Extract<AiInsightResponse, { status: "ready" }>;

export type InsightView =
  | { readonly kind: "thinking"; readonly attempt: number }
  | { readonly kind: "ready"; readonly result: ReadyResponse }
  | { readonly kind: "unavailable" | "rejected"; readonly reason: string }
  | { readonly kind: "error"; readonly error: InsightRequestError };

/** Why the request failed. `server` carries the server's own message, already in the visitor's language. */
export type InsightRequestError =
  | { readonly code: "server"; readonly message: string }
  | { readonly code: "http"; readonly status: number }
  | { readonly code: "unexpected" | "timeout" | "network" };

type Outcome = Exclude<InsightView, { kind: "thinking" }> | { readonly kind: "aborted" };

/** Longer than the server deadline of the longest reading plus a queue wait: past it, the page says so. */
export const CLIENT_TIMEOUT_MS = 5 * 60_000;

export const INITIAL_VIEW: InsightView = { kind: "thinking", attempt: 0 };

function envelopeMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = (error as { message: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

function toView(response: AiInsightResponse): Outcome {
  return response.status === "ready" ? { kind: "ready", result: response } : { kind: response.status, reason: response.reason };
}

/** One POST, validated at the boundary. Never rejects: every failure becomes an outcome. */
async function requestInsight(analysisId: string, signal: AbortSignal): Promise<Outcome> {
  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.any([signal, timeout]),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message = envelopeMessage(body);
      return { kind: "error", error: message ? { code: "server", message } : { code: "http", status: res.status } };
    }
    const data = typeof body === "object" && body !== null && "data" in body ? (body as { data: unknown }).data : undefined;
    const parsed = aiInsightResponseSchema.safeParse(data);
    return parsed.success ? toView(parsed.data) : { kind: "error", error: { code: "unexpected" } };
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    if (timeout.aborted) return { kind: "error", error: { code: "timeout" } };
    return { kind: "error", error: { code: "network" } };
  }
}

interface Entry {
  view: InsightView;
  controller: AbortController | null;
  attempts: number;
  users: number;
  readonly listeners: Set<() => void>;
}

const entries = new Map<string, Entry>();

const entryKey = (analysisId: string, locale: Locale): string => `${analysisId}|${locale}`;

function notify(entry: Entry): void {
  for (const listener of entry.listeners) listener();
}

function start(analysisId: string, entry: Entry): void {
  const controller = new AbortController();
  entry.controller = controller;
  void requestInsight(analysisId, controller.signal).then((outcome) => {
    if (entry.controller !== controller || outcome.kind === "aborted") return;
    entry.controller = null;
    entry.view = outcome;
    notify(entry);
  });
}

/** Current view of an analysis's reading in one language (stable reference until it changes). */
export function getInsightView(analysisId: string, locale: Locale): InsightView {
  return entries.get(entryKey(analysisId, locale))?.view ?? INITIAL_VIEW;
}

/** Subscribes a view; the first subscriber starts the request. Returns the unsubscribe function. */
export function subscribeInsight(analysisId: string, locale: Locale, listener: () => void): () => void {
  const key = entryKey(analysisId, locale);
  let entry = entries.get(key);
  if (!entry) {
    entry = { view: INITIAL_VIEW, controller: null, attempts: 0, users: 0, listeners: new Set() };
    entries.set(key, entry);
  }
  const current = entry;
  current.listeners.add(listener);
  current.users += 1;
  if (current.view.kind === "thinking" && !current.controller) start(analysisId, current);
  return () => {
    current.listeners.delete(listener);
    current.users -= 1;
    // Deferred, so a Strict Mode remount keeps the request alive.
    setTimeout(() => {
      if (current.users > 0 || entries.get(key) !== current || !current.controller) return;
      current.controller.abort();
      entries.delete(key);
    }, 0);
  };
}

/** Asks again, for every view of this analysis at once. */
export function retryInsight(analysisId: string, locale: Locale): void {
  const entry = entries.get(entryKey(analysisId, locale));
  if (!entry || entry.view.kind === "thinking") return;
  entry.controller?.abort();
  entry.attempts += 1;
  entry.view = { kind: "thinking", attempt: entry.attempts };
  start(analysisId, entry);
  notify(entry);
}

/** Forgets every entry (tests). */
export function resetInsightStore(): void {
  for (const entry of entries.values()) entry.controller?.abort();
  entries.clear();
}
