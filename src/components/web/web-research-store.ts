import { useSyncExternalStore } from "react";
import { webResearchResponseSchema, type WebResearchResponse } from "@/domain/web";

/**
 * State of one web search, kept per query: the simple and advanced views of a report show the same
 * question and the same answer. Nothing runs until the visitor says yes.
 */

export type WebResearchView =
  | { readonly kind: "ask" }
  | { readonly kind: "declined" }
  | { readonly kind: "searching" }
  | { readonly kind: "done"; readonly response: WebResearchResponse }
  | { readonly kind: "error" };

const ASK: WebResearchView = { kind: "ask" };
const views = new Map<string, WebResearchView>();
const listeners = new Map<string, Set<() => void>>();

function publish(query: string, view: WebResearchView): void {
  views.set(query, view);
  listeners.get(query)?.forEach((listener) => listener());
}

export function declineWebResearch(query: string): void {
  publish(query, { kind: "declined" });
}

export async function runWebResearch(query: string, request: typeof fetch = fetch): Promise<void> {
  if (views.get(query)?.kind === "searching") return;
  publish(query, { kind: "searching" });
  try {
    const response = await request("/api/web/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const parsed = webResearchResponseSchema.safeParse(((await response.json()) as { data?: unknown }).data);
    publish(query, parsed.success ? { kind: "done", response: parsed.data } : { kind: "error" });
  } catch {
    publish(query, { kind: "error" });
  }
}

export const getWebResearchView = (query: string): WebResearchView => views.get(query) ?? ASK;

function subscribe(query: string, listener: () => void): () => void {
  const set = listeners.get(query) ?? new Set();
  listeners.set(query, set);
  set.add(listener);
  return () => set.delete(listener);
}

export function useWebResearch(query: string): WebResearchView {
  return useSyncExternalStore(
    (listener) => subscribe(query, listener),
    () => getWebResearchView(query),
    () => ASK,
  );
}

/** Tests only. */
export function resetWebResearchStore(): void {
  views.clear();
  listeners.clear();
}
