import { z } from "zod";
import type { MonthlyPoint } from "@/domain/market";
import type { SourceRef } from "@/domain/provenance";
import { fail, ok, type KeywordMetrics, type ProviderResult } from "../contracts";

/**
 * Google Ads API REST — KeywordPlanIdeaService.GenerateKeywordHistoricalMetrics.
 * int64 fields are serialized as strings in JSON; bids are in micros of account currency.
 */

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

export const monthEnum = (month: number): (typeof MONTHS)[number] => MONTHS[month - 1];

const int64 = z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().finite());

const metricsSchema = z.object({
  avgMonthlySearches: int64.optional(),
  competitionIndex: int64.optional(),
  lowTopOfPageBidMicros: int64.optional(),
  highTopOfPageBidMicros: int64.optional(),
  monthlySearchVolumes: z
    .array(z.object({ month: z.enum(MONTHS), year: int64, monthlySearches: int64.optional() }))
    .optional(),
});

const responseSchema = z.object({
  results: z.array(z.object({ text: z.string(), keywordMetrics: metricsSchema.optional() })).optional(),
});

const fromMicros = (micros: number | undefined): number | null => (micros === undefined ? null : micros / 1_000_000);

export function parseHistoricalMetrics(
  payload: unknown,
  currency: string,
  source: SourceRef,
): ProviderResult<KeywordMetrics[]> {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "Google Ads: unexpected historical metrics shape");

  const metrics = (parsed.data.results ?? []).map((r): KeywordMetrics => {
    const m = r.keywordMetrics;
    const monthlyVolumes: MonthlyPoint[] = (m?.monthlySearchVolumes ?? [])
      .filter((v) => v.monthlySearches !== undefined)
      .map((v) => ({
        month: `${v.year}-${String(MONTHS.indexOf(v.month) + 1).padStart(2, "0")}`,
        value: v.monthlySearches ?? 0,
      }))
      .toSorted((a, b) => a.month.localeCompare(b.month));
    return {
      term: r.text,
      avgMonthlySearches: m?.avgMonthlySearches ?? null,
      monthlyVolumes,
      competitionIndex: m?.competitionIndex ?? null,
      lowTopOfPageBid: fromMicros(m?.lowTopOfPageBidMicros),
      highTopOfPageBid: fromMicros(m?.highTopOfPageBidMicros),
      currency,
      source,
    };
  });
  return ok(metrics);
}

const searchSchema = z.object({
  results: z
    .array(
      z.object({
        customer: z.object({ currencyCode: z.string() }).optional(),
        languageConstant: z.object({ resourceName: z.string() }).optional(),
      }),
    )
    .optional(),
});

export function parseCurrency(payload: unknown): string | null {
  const parsed = searchSchema.safeParse(payload);
  return parsed.success ? (parsed.data.results?.[0]?.customer?.currencyCode ?? null) : null;
}

export function parseLanguageConstant(payload: unknown): string | null {
  const parsed = searchSchema.safeParse(payload);
  return parsed.success ? (parsed.data.results?.[0]?.languageConstant?.resourceName ?? null) : null;
}
