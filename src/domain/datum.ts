import { mergeSources, type SourceRef } from "./provenance";

/**
 * Datum<T> is the only way a number travels from a data source to the UI.
 * It is either a Known value — with its epistemic kind and its sources —
 * or an explicit DATA_INSUFFICIENT marker with the reason.
 */

export const DATA_INSUFFICIENT = "DATA_INSUFFICIENT" as const;

/**
 * Epistemic status. Never mix them up in the UI:
 * - observed:   measured by an external source, untransformed
 * - assumption: hypothesis chosen by the user or by configuration
 * - derived:    deterministic calculation from observed values
 * - estimate:   projection / model output with uncertainty
 */
export type ValueKind = "observed" | "assumption" | "derived" | "estimate";

export type Unit =
  | "searches_per_month"
  | "pageviews_per_month"
  | "index_0_100"
  | "percent"
  | "ratio"
  | "count"
  | "orders"
  | "money"
  | "people"
  | "money_per_capita_ppp"
  | "score_0_100"
  | "month_of_year"
  | "months"
  | "none";

export interface Known<T> {
  readonly status: "known";
  readonly kind: ValueKind;
  readonly value: T;
  readonly unit: Unit;
  readonly sources: readonly SourceRef[];
  /** Identifier or short description of the formula / model used. */
  readonly method?: string;
  /** Keys of the assumptions this value depends on. */
  readonly assumptionKeys?: readonly string[];
  readonly note?: string;
}

export interface Insufficient {
  readonly status: typeof DATA_INSUFFICIENT;
  readonly reason: string;
  /** Machine-readable list of missing inputs (provider ids, fields...). */
  readonly missing: readonly string[];
}

export type Datum<T> = Known<T> | Insufficient;

/** P10 / P50 / P90 interval of a simulated or projected quantity. */
export interface Interval {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

export const isKnown = <T>(d: Datum<T>): d is Known<T> => d.status === "known";

export const observed = <T>(
  value: T,
  unit: Unit,
  sources: readonly SourceRef[],
  note?: string,
): Known<T> => ({ status: "known", kind: "observed", value, unit, sources, note });

interface ComputedOptions {
  readonly method: string;
  readonly inputs: ReadonlyArray<Known<unknown>>;
  readonly assumptionKeys?: readonly string[];
  readonly note?: string;
}

const computed = <T>(kind: "derived" | "estimate", value: T, unit: Unit, opts: ComputedOptions): Known<T> => ({
  status: "known",
  kind,
  value,
  unit,
  sources: mergeSources(...opts.inputs.map((i) => i.sources)),
  method: opts.method,
  assumptionKeys: dedupe(opts.inputs.flatMap((i) => i.assumptionKeys ?? []).concat(opts.assumptionKeys ?? [])),
  note: opts.note,
});

export const derived = <T>(value: T, unit: Unit, opts: ComputedOptions): Known<T> =>
  computed("derived", value, unit, opts);

export const estimate = <T>(value: T, unit: Unit, opts: ComputedOptions): Known<T> =>
  computed("estimate", value, unit, opts);

export const insufficient = (reason: string, missing: readonly string[] = []): Insufficient => ({
  status: DATA_INSUFFICIENT,
  reason,
  missing: dedupe(missing),
});

/** Transform a known value, keeping provenance; insufficiency propagates unchanged. */
export function mapDatum<T, U>(d: Datum<T>, fn: (value: T) => U, unit?: Unit): Datum<U> {
  if (!isKnown(d)) return d;
  return { ...d, value: fn(d.value), unit: unit ?? d.unit };
}

/** Collect the `missing` entries of every insufficient datum. */
export function collectMissing(...datums: ReadonlyArray<Datum<unknown>>): string[] {
  return dedupe(datums.flatMap((d) => (isKnown(d) ? [] : d.missing)));
}

/** True if any source of the datum is a development mock. */
export const isMockTainted = (d: Datum<unknown>): boolean =>
  isKnown(d) && d.sources.some((s) => s.origin === "mock");

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}
