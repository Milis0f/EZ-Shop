import { z } from "zod";

/**
 * What kind of fact a competitive value is, and whether its source could answer at all.
 * See docs/COMPETITIVE-SOURCES.md. A value without a nature is never shown as data.
 */

export const DATA_NATURES = ["observed", "published", "declared", "provider_estimated", "ezshop_estimated", "inferred", "unknown"] as const;
export type DataNature = (typeof DATA_NATURES)[number];

export const COVERAGE_STATES = [
  "available",
  "not_covered",
  "insufficient_data",
  "permission_required",
  "paid_required",
  "rate_limited",
  "blocked",
  "not_confirmed",
  "not_applicable",
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

/** Natures that are a measure or a reading of the world, as opposed to a model or a sign. */
export function isFactual(nature: DataNature): boolean {
  return nature === "observed" || nature === "published" || nature === "declared";
}

/** One competitive value with its provenance, as the visibility profile and the observatory keep it. */
export const sourcedValueSchema = z.object({
  metric: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string().nullable(),
  nature: z.enum(DATA_NATURES),
  coverage: z.enum(COVERAGE_STATES),
  /** Provider id or `ezshop`. */
  source: z.string().min(1),
  /** Public URL of the source, never with a key. */
  sourceUrl: z.string().nullable(),
  observedAt: z.string(),
  /** Period the value describes, when the source states one. */
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  /** Attribution the provider requires, shown next to the value. */
  attribution: z.string().nullable(),
});
export type SourcedValue = z.infer<typeof sourcedValueSchema>;

/**
 * A value is shown as a number only when its source answered with it; any other coverage keeps the
 * value null, so a failure never reads as a zero.
 */
export function sourced(input: Omit<SourcedValue, "value"> & { readonly value: number | null }): SourcedValue {
  const value = input.coverage === "available" && input.value !== null && Number.isFinite(input.value) ? input.value : null;
  const coverage = input.coverage === "available" && value === null ? "insufficient_data" : input.coverage;
  return { ...input, value, coverage, nature: value === null ? "unknown" : input.nature };
}

/** Coverage of an HTTP answer that carried no usable value. */
export function coverageOfStatus(status: number): CoverageState {
  if (status === 401 || status === 403) return "permission_required";
  if (status === 402) return "paid_required";
  if (status === 404) return "not_covered";
  if (status === 429) return "rate_limited";
  return "blocked";
}
