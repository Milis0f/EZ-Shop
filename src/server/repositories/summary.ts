import type { AnalysisSummary, AnalysisStatus, DataMode } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";

export interface CountryScoreRow {
  readonly countryCode: CountryCode;
  readonly opportunityScore: number | null;
  readonly confidenceScore: number;
}

export interface SummaryInput {
  readonly id: string;
  readonly productName: string;
  readonly status: AnalysisStatus;
  readonly dataMode: DataMode;
  readonly countryCount: number;
  readonly createdAt: string;
  readonly scores: readonly CountryScoreRow[];
}

/** Best scored country; ties broken by confidence. */
export function toSummary(input: SummaryInput): AnalysisSummary {
  const scored = input.scores
    .filter((s): s is CountryScoreRow & { opportunityScore: number } => s.opportunityScore !== null)
    .toSorted((a, b) => b.opportunityScore - a.opportunityScore || b.confidenceScore - a.confidenceScore);
  const top = scored[0];
  return {
    id: input.id,
    productName: input.productName,
    status: input.status,
    dataMode: input.dataMode,
    countryCount: input.countryCount,
    createdAt: input.createdAt,
    topCountry: top
      ? { code: top.countryCode, score: top.opportunityScore, confidence: top.confidenceScore }
      : undefined,
  };
}
