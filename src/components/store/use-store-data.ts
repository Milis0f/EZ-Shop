"use client";

import { useEffect, useState } from "react";
import { endAnalysis, reportAnalysis, startAnalysis } from "@/components/planet/planet-store";
import type { BrandResult, InstagramResult, StoreResult, StoreSummary, StoreWebResult, StripeResult, TrafficResult } from "@/domain/store";
import type { SalesPeriods } from "@/engine/store/periods";

/**
 * Reads every source of "My store" at once, each from its own request, so the page fills in as
 * they arrive and a slow or refused one never holds the others. The planet's ring follows the real
 * count of sources read.
 */

export const STORE_PARTS = ["store", "traffic", "brand", "web", "instagram", "stripe"] as const;
export type StorePart = (typeof STORE_PARTS)[number];
/** The planet's ring follows these; the slower readings of the web arrive afterwards, in their panels. */
const CORE: readonly StorePart[] = ["store", "traffic", "brand"];

export interface StorePayload {
  readonly result: StoreResult;
  readonly summary: StoreSummary | null;
  readonly periods: SalesPeriods | null;
}

interface PartData {
  readonly store: StorePayload;
  readonly traffic: TrafficResult;
  readonly brand: BrandResult;
  readonly web: StoreWebResult;
  readonly instagram: InstagramResult;
  readonly stripe: StripeResult;
}

export type PartState<T> = { readonly status: "loading" } | { readonly status: "done"; readonly data: T } | { readonly status: "failed" };
export type StoreData = { readonly [K in StorePart]: PartState<PartData[K]> };

const LOADING: StoreData = Object.fromEntries(STORE_PARTS.map((part) => [part, { status: "loading" }])) as unknown as StoreData;

/** Whether a source answered with its data, as opposed to "not connected" or a refusal. */
export function partOk(state: PartState<unknown>): boolean {
  if (state.status !== "done") return false;
  const data = state.data as { ok?: boolean; result?: { ok?: boolean } };
  return data.ok ?? data.result?.ok ?? false;
}

export function partCode(state: PartState<unknown>): string | null {
  if (state.status !== "done") return null;
  const data = state.data as { code?: string; result?: { code?: string } };
  return data.code ?? data.result?.code ?? null;
}

export interface StoreDataOptions {
  readonly planetMessage: string;
  readonly stepLabel: (part: StorePart) => string;
}

export function useStoreData({ planetMessage, stepLabel }: StoreDataOptions): StoreData {
  const [data, setData] = useState<StoreData>(LOADING);

  useEffect(() => {
    const abort = new AbortController();
    let done = 0;
    startAnalysis({ product: planetMessage, countries: [], message: planetMessage, expectedMs: 6_000, phases: CORE.map(stepLabel) });
    for (const part of STORE_PARTS) {
      fetch(`/api/store/${part}`, { signal: abort.signal, cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as { data?: unknown };
          if (body.data === undefined) throw new Error("no data");
          setData((current) => ({ ...current, [part]: { status: "done", data: body.data } }));
        })
        .catch((error: unknown) => {
          if (abort.signal.aborted) return;
          console.error(`[store] ${part} not read`, error instanceof Error ? error.name : typeof error);
          setData((current) => ({ ...current, [part]: { status: "failed" } }));
        })
        .finally(() => {
          if (abort.signal.aborted || !CORE.includes(part)) return;
          done += 1;
          reportAnalysis({ progress: done / CORE.length, step: stepLabel(part) });
          if (done === CORE.length) endAnalysis();
        });
    }
    return () => {
      abort.abort();
      endAnalysis();
    };
    // The labels are read once, at the start of the reading: a language change does not read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}
