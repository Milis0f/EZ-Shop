import { FORECAST_PARAMS } from "@/config/scoring";
import { derived, insufficient, isKnown, observed, type Datum, type Known } from "@/domain/datum";
import type { DemandHistory, MonthlyPoint } from "@/domain/market";
import { mergeSources } from "@/domain/provenance";
import type { KeywordMetrics, TermInterestSeries, TopicInterestObservation } from "@/providers/contracts";
import { mean, pearson, sum } from "../stats/descriptive";

export interface DemandInputs {
  readonly keywordMetrics: Datum<readonly KeywordMetrics[]>;
  readonly searchInterest: Datum<readonly TermInterestSeries[]>;
  /** Wikipedia pageviews of the category article: last-resort shape, never a volume. */
  readonly topicInterest?: Datum<TopicInterestObservation>;
}

export interface BuiltHistory {
  readonly history: Datum<DemandHistory>;
  readonly avgMonthlySearches: Datum<number>;
  /** Pearson r between Keyword Planner volumes and the Trends index on overlapping months. */
  readonly crossSourceCorrelation: number | null;
}

const MIN_OVERLAP_MONTHS = 6;

/** Sum several term series month by month (terms are distinct keywords). */
export function sumByMonth(seriesList: ReadonlyArray<readonly MonthlyPoint[]>): MonthlyPoint[] {
  const totals = new Map<string, number>();
  for (const series of seriesList) for (const p of series) totals.set(p.month, (totals.get(p.month) ?? 0) + p.value);
  return [...totals.entries()].map(([month, value]) => ({ month, value })).toSorted((a, b) => a.month.localeCompare(b.month));
}

function overlap(a: readonly MonthlyPoint[], b: readonly MonthlyPoint[]): { a: number[]; b: number[] } {
  const bByMonth = new Map(b.map((p) => [p.month, p.value]));
  const pairs = a.flatMap((p) => (bByMonth.has(p.month) ? [[p.value, bByMonth.get(p.month) ?? 0] as const] : []));
  return { a: pairs.map((x) => x[0]), b: pairs.map((x) => x[1]) };
}

function avgSearches(kp: Known<readonly KeywordMetrics[]> | undefined): Datum<number> {
  const values = (kp?.value ?? []).map((m) => m.avgMonthlySearches).filter((v): v is number => v !== null);
  if (!kp || values.length === 0) {
    return insufficient("Volume de recherche absolu indisponible (Google Ads Keyword Planner non connecté).", [
      "google-ads-keyword-planner",
    ]);
  }
  return kp.value.length > 1
    ? derived(sum(values), "searches_per_month", { method: "sum_over_terms", inputs: [kp] })
    : observed(values[0], "searches_per_month", kp.sources);
}

export function buildDemandHistory({ keywordMetrics, searchInterest, topicInterest }: DemandInputs): BuiltHistory {
  const kp = isKnown(keywordMetrics) ? keywordMetrics : undefined;
  const trends = isKnown(searchInterest) ? searchInterest : undefined;
  const kpSeries = sumByMonth((kp?.value ?? []).map((m) => m.monthlyVolumes));
  const trendSeries = sumByMonth((trends?.value ?? []).map((t) => t.points));
  const avgMonthlySearches = avgSearches(kp);

  const common = overlap(kpSeries, trendSeries);
  const crossSourceCorrelation = common.a.length >= MIN_OVERLAP_MONTHS ? pearson(common.a, common.b) : null;
  const { minMonthsForSeasonality: longEnough, minMonthsForTrend: minimum } = FORECAST_PARAMS;

  const absolute = (series: MonthlyPoint[]): Datum<DemandHistory> =>
    kp && kp.value.length > 1
      ? derived({ basis: "absolute_volume", series }, "searches_per_month", { method: "sum_over_terms", inputs: [kp] })
      : observed({ basis: "absolute_volume", series }, "searches_per_month", kp?.sources ?? []);

  if (kpSeries.length >= longEnough) return { history: absolute(kpSeries), avgMonthlySearches, crossSourceCorrelation };

  if (trends && trendSeries.length >= longEnough && isKnown(avgMonthlySearches)) {
    const scale =
      common.a.length >= MIN_OVERLAP_MONTHS
        ? mean(common.a) / Math.max(1e-9, mean(common.b))
        : avgMonthlySearches.value / Math.max(1e-9, mean(trendSeries.slice(-12).map((p) => p.value)));
    const series = trendSeries.map((p) => ({ month: p.month, value: p.value * scale }));
    const history = derived({ basis: "absolute_volume" as const, series }, "searches_per_month", {
      method: "trends_index_calibrated_on_keyword_planner",
      inputs: [trends, avgMonthlySearches],
      note: "Forme issue de Google Trends, niveau calé sur les volumes Keyword Planner.",
    });
    return { history, avgMonthlySearches, crossSourceCorrelation };
  }

  if (trends && trendSeries.length >= minimum) {
    const value: DemandHistory = { basis: "relative_index", series: trendSeries };
    const history =
      trends.value.length > 1
        ? derived(value, "index_0_100", { method: "sum_over_terms", inputs: [trends] })
        : observed(value, "index_0_100", mergeSources(trends.sources), "Indice relatif : forme de la demande, pas un volume.");
    return { history, avgMonthlySearches, crossSourceCorrelation };
  }

  if (kpSeries.length >= minimum) return { history: absolute(kpSeries), avgMonthlySearches, crossSourceCorrelation };

  const topic = topicInterest && isKnown(topicInterest) ? topicInterest : undefined;
  if (topic && topic.value.points.length >= minimum) {
    const history = observed<DemandHistory>(
      { basis: "topic_interest", series: [...topic.value.points] },
      "pageviews_per_month",
      topic.sources,
      `Lectures de l'article Wikipédia « ${topic.value.article} » (${topic.value.language}) : intérêt pour la catégorie, ni des recherches ni un chiffre par pays.`,
    );
    return { history, avgMonthlySearches, crossSourceCorrelation };
  }

  return {
    history: insufficient(`Historique de demande insuffisant (< ${minimum} mois).`, [
      ...(kp ? [] : ["google-ads-keyword-planner"]),
      ...(trends ? [] : ["google-trends"]),
      ...(topic ? [] : ["wikimedia"]),
    ]),
    avgMonthlySearches,
    crossSourceCorrelation,
  };
}
