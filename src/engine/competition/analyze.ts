import { COMPETITION_TREND_PARAMS, COMPETITION_WEIGHTS, NORMALIZATION_BOUNDS } from "@/config/scoring";
import { derived, estimate, insufficient, isKnown, observed, type Datum, type Known } from "@/domain/datum";
import type {
  AdActivity,
  CompetitionAnalysis,
  CompetitionAssessment,
  CompetitionComponent,
  CompetitionLevel,
  CompetitionOutlook,
  CompetitionProjection,
  WeeklyCount,
} from "@/domain/market";
import type { MarketplaceListings } from "@/domain/signals";
import type { AdActivityObservation, KeywordMetrics } from "@/providers/contracts";
import { linearFit } from "../stats/ols";
import { linearScale, round } from "../stats/normalize";

export interface CompetitionInputs {
  readonly keywordMetrics: Datum<readonly KeywordMetrics[]>;
  readonly meta: Datum<AdActivityObservation>;
  readonly tiktok: Datum<AdActivityObservation>;
  /** Listings on the national eBay site: visible supply of the same product. */
  readonly marketplace?: Datum<MarketplaceListings>;
}

const WEEKS_PER_MONTH = 52.1775 / 12;

function googleIndex(kp: Datum<readonly KeywordMetrics[]>): Datum<number> {
  if (!isKnown(kp)) return insufficient("Indice de concurrence Google Ads indisponible.", kp.missing);
  const withIndex = kp.value.filter((m) => m.competitionIndex !== null);
  if (withIndex.length === 0) return insufficient("Aucun indice de concurrence renvoyé.", ["google-ads-keyword-planner"]);
  // Volume-weighted average across terms; falls back to a plain mean when volumes are missing.
  const weights = withIndex.map((m) => m.avgMonthlySearches ?? 0);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const value =
    totalWeight > 0
      ? withIndex.reduce((s, m, i) => s + (m.competitionIndex ?? 0) * weights[i], 0) / totalWeight
      : withIndex.reduce((s, m) => s + (m.competitionIndex ?? 0), 0) / withIndex.length;
  return withIndex.length > 1
    ? derived(round(value, 1), "index_0_100", { method: "volume_weighted_mean", inputs: [kp] })
    : observed(round(value, 1), "index_0_100", kp.sources);
}

const toActivity = (d: Datum<AdActivityObservation>): Datum<AdActivity> =>
  isKnown(d)
    ? { ...d, value: { activeAds: d.value.activeAds, uniqueAdvertisers: d.value.uniqueAdvertisers, newAdsByWeek: d.value.newAdsByWeek }, note: d.value.truncated ? "Collecte tronquée : valeurs minimales." : d.note }
    : d;

const levelOf = (index: number): CompetitionLevel =>
  index < 25 ? "low" : index < 50 ? "moderate" : index < 75 ? "high" : "very_high";

const advertisersScore = (n: number): number =>
  linearScale(Math.log10(Math.max(1, n)), NORMALIZATION_BOUNDS.advertisersLog10.min, NORMALIZATION_BOUNDS.advertisersLog10.max);

const listingsScore = (n: number): number =>
  linearScale(Math.log10(Math.max(1, n)), NORMALIZATION_BOUNDS.marketplaceListingsLog10.min, NORMALIZATION_BOUNDS.marketplaceListingsLog10.max);

function assessCurrent(
  google: Datum<number>,
  meta: Datum<AdActivity>,
  tiktok: Datum<AdActivity>,
  marketplace: Datum<MarketplaceListings> | undefined,
): Datum<CompetitionAssessment> {
  const parts: Array<{ component: CompetitionComponent; input: Known<unknown> }> = [];
  if (isKnown(google)) {
    parts.push({ component: { id: "google_competition", label: "Concurrence Google Ads", normalized: google.value / 100, weight: COMPETITION_WEIGHTS.google_competition }, input: google });
  }
  if (isKnown(meta)) {
    parts.push({ component: { id: "meta_advertisers", label: "Annonceurs actifs Meta", normalized: advertisersScore(meta.value.uniqueAdvertisers), weight: COMPETITION_WEIGHTS.meta_advertisers }, input: meta });
  }
  if (isKnown(tiktok)) {
    parts.push({ component: { id: "tiktok_advertisers", label: "Annonceurs actifs TikTok", normalized: advertisersScore(tiktok.value.uniqueAdvertisers), weight: COMPETITION_WEIGHTS.tiktok_advertisers }, input: tiktok });
  }
  if (marketplace && isKnown(marketplace)) {
    parts.push({
      component: { id: "marketplace_listings", label: "Annonces eBay du pays", normalized: listingsScore(marketplace.value.listings), weight: COMPETITION_WEIGHTS.marketplace_listings },
      input: marketplace,
    });
  }
  if (parts.length === 0) {
    return insufficient("Aucune source de concurrence disponible.", [
      "google-ads-keyword-planner",
      "meta-ad-library",
      "tiktok-commercial-content",
      "ebay-browse",
    ]);
  }
  const totalWeight = parts.reduce((s, p) => s + p.component.weight, 0);
  const index = round((100 * parts.reduce((s, p) => s + p.component.normalized * p.component.weight, 0)) / totalWeight, 1);
  return derived({ index, level: levelOf(index), components: parts.map((p) => p.component) }, "index_0_100", {
    method: "weighted_competition_index_v1",
    inputs: parts.map((p) => p.input),
    note: parts.length < 4 ? "Indice calculé sur une partie des sources (poids renormalisés)." : undefined,
  });
}

function mergeWeekly(...series: ReadonlyArray<readonly WeeklyCount[]>): WeeklyCount[] {
  const totals = new Map<string, number>();
  for (const s of series) for (const w of s) totals.set(w.weekStart, (totals.get(w.weekStart) ?? 0) + w.count);
  return [...totals.entries()].map(([weekStart, count]) => ({ weekStart, count })).toSorted((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function outlookOf(monthlyGrowthPct: number): CompetitionOutlook {
  const { stableMonthlyGrowthPct: stable, surgingMonthlyGrowthPct: surging } = COMPETITION_TREND_PARAMS;
  if (monthlyGrowthPct < -stable) return "decreasing";
  if (monthlyGrowthPct <= stable) return "stable";
  return monthlyGrowthPct <= surging ? "increasing" : "surging";
}

function projectFuture(meta: Datum<AdActivity>, tiktok: Datum<AdActivity>): Datum<CompetitionProjection> {
  const known = [meta, tiktok].filter(isKnown);
  if (known.length === 0) return insufficient("Concurrence future : aucune bibliothèque publicitaire disponible.", ["meta-ad-library", "tiktok-commercial-content"]);
  const weekly = mergeWeekly(...known.map((k) => k.value.newAdsByWeek));
  const totalNew = weekly.reduce((s, w) => s + w.count, 0);
  if (weekly.length < COMPETITION_TREND_PARAMS.minWeeks || totalNew < 10) {
    return insufficient(`Concurrence future : au moins ${COMPETITION_TREND_PARAMS.minWeeks} semaines et 10 nouvelles annonces requises.`, []);
  }
  const fit = linearFit(weekly.map((_, i) => i), weekly.map((w) => Math.log1p(w.count)));
  if (!fit) return insufficient("Concurrence future : ajustement impossible.", []);
  const monthlyGrowthPct = round((Math.exp(fit.beta[1] * WEEKS_PER_MONTH) - 1) * 100, 1);
  return estimate({ outlook: outlookOf(monthlyGrowthPct), monthlyGrowthPct, weeksUsed: weekly.length }, "percent", {
    method: "loglinear_trend_new_ads_per_week_v1",
    inputs: known,
    note: "Projection de la pression concurrentielle visible, pas du nombre réel de concurrents.",
  });
}

export function analyzeCompetition(inputs: CompetitionInputs): CompetitionAnalysis {
  const google = googleIndex(inputs.keywordMetrics);
  const meta = toActivity(inputs.meta);
  const tiktok = toActivity(inputs.tiktok);
  return {
    googleCompetitionIndex: google,
    meta,
    tiktok,
    current: assessCurrent(google, meta, tiktok, inputs.marketplace),
    future: projectFuture(meta, tiktok),
  };
}
