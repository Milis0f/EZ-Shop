import { aiInsightResponseSchema, type AiInsightResponse } from "@/domain/ai-insight";

/**
 * Client store of the local AI reading, one entry per analysis. The simple and advanced views of a
 * page are both mounted (CSS hides one), so they read the same entry: one request, one outcome, and
 * a retry from either view updates both. The request is aborted once nobody listens any more.
 */

export type ReadyResponse = Extract<AiInsightResponse, { status: "ready" }>;

export type InsightView =
  | { readonly kind: "thinking"; readonly attempt: number }
  | { readonly kind: "ready"; readonly result: ReadyResponse }
  | { readonly kind: "unavailable" | "rejected"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

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
    if (!res.ok) return { kind: "error", message: envelopeMessage(body) ?? `le serveur a répondu ${res.status}.` };
    const data = typeof body === "object" && body !== null && "data" in body ? (body as { data: unknown }).data : undefined;
    const parsed = aiInsightResponseSchema.safeParse(data);
    return parsed.success ? toView(parsed.data) : { kind: "error", message: "réponse inattendue du serveur." };
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    if (timeout.aborted) return { kind: "error", message: "l'IA locale n'a pas répondu à temps." };
    return { kind: "error", message: "le serveur ne répond pas." };
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

/** Current view of an analysis's reading (stable reference until it changes). */
export function getInsightView(analysisId: string): InsightView {
  return entries.get(analysisId)?.view ?? INITIAL_VIEW;
}

/** Subscribes a view; the first subscriber starts the request. Returns the unsubscribe function. */
export function subscribeInsight(analysisId: string, listener: () => void): () => void {
  let entry = entries.get(analysisId);
  if (!entry) {
    entry = { view: INITIAL_VIEW, controller: null, attempts: 0, users: 0, listeners: new Set() };
    entries.set(analysisId, entry);
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
      if (current.users > 0 || entries.get(analysisId) !== current || !current.controller) return;
      current.controller.abort();
      entries.delete(analysisId);
    }, 0);
  };
}

/** Asks again, for every view of this analysis at once. */
export function retryInsight(analysisId: string): void {
  const entry = entries.get(analysisId);
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
