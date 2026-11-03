import { REVIEW_RATES, type SalesEstimate } from "@/domain/competitor";

/**
 * A competitor's sales, estimated from its public reviews: buyers ≈ reviews ÷ the share of buyers who
 * leave one. That share is an assumption (5 %, 2 % and 1 % for the low, middle and high estimate), so
 * the result is a range, never a figure, and it is only as good as the reviews are genuine. Without
 * reviews or without an age to spread them over, there is no estimate.
 */

const DAYS_PER_MONTH = 30.44;
const DAY_MS = 86_400_000;
/** Under this many reviews, one review more or less moves the estimate a lot. */
const FEW_REVIEWS = 10;
/** From this many genuine reviews over three months or more, the estimate is worth a medium confidence. */
const MEDIUM_REVIEWS = 30;
const YOUNG_MONTHS = 3;

export type AgeFrom = SalesEstimate["ageFrom"];

export interface EstimateInput {
  readonly basis: SalesEstimate["basis"];
  readonly reviews: number | null;
  /** Dates the reviews may have been gathered since, best first; the first known one is used. */
  readonly ages: ReadonlyArray<{ readonly from: AgeFrom; readonly at: string | null }>;
  readonly price: number | null;
  /** The price stands in for an average order (the shop's median price): an assumption. */
  readonly priceAssumed: boolean;
  readonly currency: string | null;
  /** A dropshipping app is installed: reviews may have been imported from a marketplace. */
  readonly importedReviewsPossible: boolean;
  readonly nowMs: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function estimateSales(input: EstimateInput): SalesEstimate | null {
  if (input.reviews === null || input.reviews <= 0) return null;
  const age = input.ages.find((candidate) => candidate.at !== null && Number.isFinite(Date.parse(candidate.at)) && Date.parse(candidate.at) < input.nowMs);
  if (!age?.at) return null;
  const months = Math.max(1, (input.nowMs - Date.parse(age.at)) / DAY_MS / DAYS_PER_MONTH);
  const reviews = input.reviews;
  const total = { p10: reviews / REVIEW_RATES.p10, p50: reviews / REVIEW_RATES.p50, p90: reviews / REVIEW_RATES.p90 };
  const perMonth = { p10: total.p10 / months, p50: total.p50 / months, p90: total.p90 / months };
  const price = input.price !== null && input.price > 0 ? input.price : null;

  const cautions: SalesEstimate["cautions"] = [];
  if (reviews < FEW_REVIEWS) cautions.push("few_reviews");
  if (input.importedReviewsPossible) cautions.push("imported_reviews");
  if (months < YOUNG_MONTHS) cautions.push("young");
  if (price !== null && input.priceAssumed) cautions.push("price_assumed");
  if (age.from === "domain_registered" || age.from === "first_archived") cautions.push("age_from_domain");
  const medium = reviews >= MEDIUM_REVIEWS && !input.importedReviewsPossible && months >= YOUNG_MONTHS;

  return {
    basis: input.basis,
    reviews,
    months: round(months),
    ageFrom: age.from,
    total: { p10: round(total.p10), p50: round(total.p50), p90: round(total.p90) },
    perMonth: { p10: round(perMonth.p10), p50: round(perMonth.p50), p90: round(perMonth.p90) },
    revenuePerMonth: price === null ? null : { p10: round(perMonth.p10 * price), p50: round(perMonth.p50 * price), p90: round(perMonth.p90 * price) },
    price,
    currency: input.currency,
    confidence: medium ? "medium" : "low",
    cautions,
  };
}
