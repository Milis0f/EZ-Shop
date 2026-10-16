import {
  COMPETITION_OUTLOOK_SCORE,
  MARKET_CONTEXT_WEIGHTS,
  NORMALIZATION_BOUNDS as B,
  SCORING_POLICY,
  SEASONALITY_TIMING_SCORES as T,
} from "@/config/scoring";
import { isKnown, type Datum, type Known } from "@/domain/datum";
import { mergeSources } from "@/domain/provenance";
import { MONTH_LABELS_FR } from "@/domain/time";
import { linearScale, log10Scale, round, towards } from "../stats/normalize";
import type { Criterion, CriterionEvaluation, ScoringContext } from "./types";

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const missing = (explanation: string, ...datums: ReadonlyArray<Datum<unknown>>): CriterionEvaluation => ({
  status: "DATA_INSUFFICIENT",
  explanation,
  missing: [...new Set(datums.flatMap((d) => (isKnown(d) ? [] : d.missing)))],
});

const scored = (
  normalized: number,
  explanation: string,
  inputs: ReadonlyArray<Known<unknown>>,
  extra: { rawValue?: number; rawLabel?: string; cap?: { cap: number; reason: string } } = {},
): CriterionEvaluation => ({
  status: "scored",
  normalized: round(normalized, 4),
  explanation,
  sources: mergeSources(...inputs.map((i) => i.sources)),
  ...extra,
});

const demandVolume: Criterion = {
  id: "demand_volume",
  label: "Volume de demande",
  timeSensitive: true,
  evaluate: ({ demand }) => {
    const v = demand.avgMonthlySearches;
    if (!isKnown(v)) return missing("Volume absolu indisponible.", v);
    return scored(log10Scale(v.value, B.demandVolumeLog10.min, B.demandVolumeLog10.max), "Échelle log : 100 → 0, 100 000 recherches/mois → 1.", [v], {
      rawValue: v.value,
      rawLabel: `${fmt.format(v.value)} recherches/mois`,
    });
  },
};

/** Suffix telling the reader when demand shape comes from Wikipedia rather than search data. */
const basisNote = (demand: ScoringContext["demand"]): string =>
  isKnown(demand.history) && demand.history.value.basis === "topic_interest" ? " Calculé sur l'audience Wikipédia de la catégorie, faute de données de recherche." : "";

const demandTrend: Criterion = {
  id: "demand_trend",
  label: "Tendance historique",
  timeSensitive: true,
  evaluate: ({ demand }) => {
    const t = demand.trend;
    if (!isKnown(t)) return missing("Tendance indisponible.", t);
    const g = t.value.annualGrowthPct;
    return scored(linearScale(g, B.annualGrowthPct.min, B.annualGrowthPct.max), `Croissance annuelle : −30 % → 0, +50 % → 1.${basisNote(demand)}`, [t], {
      rawValue: g,
      rawLabel: `${g > 0 ? "+" : ""}${fmt.format(g)} %/an`,
    });
  },
};

const demandOutlook: Criterion = {
  id: "demand_outlook",
  label: "Demande future (12 mois)",
  timeSensitive: true,
  evaluate: ({ demand }) => {
    const f = demand.futureGrowthPct;
    if (!isKnown(f)) return missing("Prévision indisponible.", f);
    return scored(linearScale(f.value, B.futureGrowthPct.min, B.futureGrowthPct.max), `12 prochains mois vs 12 derniers : −20 % → 0, +30 % → 1.${basisNote(demand)}`, [f], {
      rawValue: f.value,
      rawLabel: `${f.value > 0 ? "+" : ""}${fmt.format(f.value)} %`,
    });
  },
};

const seasonalityTiming: Criterion = {
  id: "seasonality_timing",
  label: "Timing saisonnier",
  timeSensitive: true,
  evaluate: ({ demand }) => {
    const s = demand.seasonality;
    const m = demand.monthsToNextPeak;
    if (!isKnown(s) || !isKnown(m)) return missing("Saisonnalité indisponible.", s, m);
    if (!s.value.isSeasonal) return scored(T.notSeasonal, "Demande peu saisonnière : score neutre.", [s], { rawLabel: "Non saisonnier" });
    const months = m.value;
    const value = months >= 1 && months <= 3 ? T.idealWindow : months === 0 ? T.atPeak : months <= 6 ? T.midWindow : T.farFromPeak;
    const peak = MONTH_LABELS_FR[(s.value.peakMonths[0] ?? 1) - 1];
    return scored(value, "Idéal : lancer 1 à 3 mois avant le pic.", [s, m], { rawValue: months, rawLabel: `Pic en ${peak} (dans ${months} mois)` });
  },
};

const competitionCurrent: Criterion = {
  id: "competition_current",
  label: "Concurrence actuelle",
  timeSensitive: true,
  evaluate: ({ competition }) => {
    const c = competition.current;
    if (!isKnown(c)) return missing("Aucune mesure de concurrence.", c);
    return scored(1 - c.value.index / 100, "Inverse de l'indice de concurrence (0 = saturé).", [c], {
      rawValue: c.value.index,
      rawLabel: `Indice ${fmt.format(c.value.index)}/100`,
    });
  },
};

const competitionTrend: Criterion = {
  id: "competition_trend",
  label: "Concurrence future",
  timeSensitive: true,
  evaluate: ({ competition }) => {
    const f = competition.future;
    if (!isKnown(f)) return missing("Projection concurrentielle indisponible.", f);
    return scored(COMPETITION_OUTLOOK_SCORE[f.value.outlook], "En baisse → 1, stable → 0,6, en hausse → 0,3, explosive → 0.", [f], {
      rawValue: f.value.monthlyGrowthPct,
      rawLabel: `${f.value.monthlyGrowthPct > 0 ? "+" : ""}${fmt.format(f.value.monthlyGrowthPct)} %/mois de nouvelles annonces`,
    });
  },
};

const adCost: Criterion = {
  id: "ad_cost",
  label: "Coût publicitaire",
  timeSensitive: true,
  evaluate: ({ advertising }) => {
    const cpc = advertising.find((c) => c.platform === "google")?.cpc;
    if (!cpc || !isKnown(cpc)) return missing("CPC Google indisponible.", ...(cpc ? [cpc] : []));
    const p50 = cpc.value.p50;
    return scored(1 - log10Scale(p50, B.cpcLog10.min, B.cpcLog10.max), "CPC P50 (échelle log) : 0,10 → 1, 5,00 → 0.", [cpc], {
      rawValue: p50,
      rawLabel: `CPC P50 ${fmt.format(p50)}`,
    });
  },
};

const marketContext: Criterion = {
  id: "market_context",
  label: "Contexte de marché",
  timeSensitive: false,
  evaluate: ({ market }) => {
    const parts: Array<{ w: number; v: number; d: Known<number> }> = [];
    const { gdpPerCapitaPpp: gdp, internetUsersPct: net, onlineBuyersPct: buyers } = market;
    if (isKnown(gdp)) parts.push({ w: MARKET_CONTEXT_WEIGHTS.gdpPerCapitaPpp, v: linearScale(Math.log10(gdp.value), B.gdpPerCapitaPppLog10.min, B.gdpPerCapitaPppLog10.max), d: gdp });
    if (isKnown(net)) parts.push({ w: MARKET_CONTEXT_WEIGHTS.internetUsersPct, v: net.value / 100, d: net });
    if (isKnown(buyers)) parts.push({ w: MARKET_CONTEXT_WEIGHTS.onlineBuyersPct, v: buyers.value / 100, d: buyers });
    if (parts.length === 0) return missing("Aucun indicateur macro disponible.", gdp, net, buyers);
    const total = parts.reduce((s, p) => s + p.w, 0);
    const value = parts.reduce((s, p) => s + p.w * p.v, 0) / total;
    return scored(value, "PIB/hab. PPA (log), part d'internautes, part d'acheteurs en ligne — renormalisés.", parts.map((p) => p.d));
  },
};

const unitEconomics: Criterion = {
  id: "unit_economics",
  label: "Économie unitaire",
  timeSensitive: false,
  evaluate: ({ economics, advertising, signals }) => {
    const { sellingPrice } = economics;
    // Country unit cost (sourcing + import duty) when known, else the cost typed in the form.
    const countryCost = signals && isKnown(signals.unitCostEur) ? signals.unitCostEur.value : undefined;
    const landedCost = countryCost ?? economics.landedCost;
    if (sellingPrice === undefined || landedCost === undefined) {
      return { status: "DATA_INSUFFICIENT", explanation: "Prix de vente HT et coût de revient requis.", missing: ["selling_price", "landed_cost"] };
    }
    // Search intent first (Google), otherwise the first social channel with a known CPA.
    const google = advertising.find((c) => c.platform === "google")?.cpa;
    const cpa = google && isKnown(google) ? google : advertising.map((c) => c.cpa).find(isKnown);
    if (!cpa) return missing("Aucun CPA estimable.", ...advertising.map((c) => c.cpa));
    const margin = sellingPrice - landedCost;
    const ratio = margin > 0 ? cpa.value.p50 / margin : Number.POSITIVE_INFINITY;
    const cap = ratio > 1 ? { cap: SCORING_POLICY.negativeEconomicsCap, reason: "CPA estimé supérieur à la marge unitaire." } : undefined;
    return scored(Number.isFinite(ratio) ? towards(ratio, B.cpaToMargin.best, B.cpaToMargin.worst) : 0, "CPA P50 / marge : ≤ 0,3 → 1, ≥ 1,2 → 0.", [cpa], {
      rawValue: Number.isFinite(ratio) ? round(ratio, 2) : undefined,
      rawLabel: margin > 0 ? `CPA = ${fmt.format(ratio * 100)} % de la marge` : "Marge unitaire ≤ 0",
      cap,
    });
  },
};

const searchIntent: Criterion = {
  id: "search_intent",
  label: "Recherches associées (Autocomplete)",
  timeSensitive: true,
  evaluate: ({ signals }) => {
    const s = signals?.searchSuggestions;
    if (!s || !isKnown(s)) return s ? missing("Suggestions de recherche indisponibles.", s) : { status: "DATA_INSUFFICIENT", explanation: "Suggestions de recherche indisponibles.", missing: ["google-autocomplete"] };
    const breadth = linearScale(s.value.suggestions.length, B.suggestionCount.min, B.suggestionCount.max);
    const intent = linearScale(s.value.intent.length, B.intentSuggestionCount.min, B.intentSuggestionCount.max);
    return scored(
      0.5 * breadth + 0.5 * intent,
      "Moitié nombre de suggestions (0 → 0, 10 → 1), moitié suggestions d'achat (0 → 0, 3 → 1). Signal indirect, sans volume.",
      [s],
      { rawValue: s.value.suggestions.length, rawLabel: `${s.value.suggestions.length} suggestions, dont ${s.value.intent.length} d'achat` },
    );
  },
};

const videoInterest: Criterion = {
  id: "video_interest",
  label: "Intérêt vidéo (YouTube)",
  timeSensitive: true,
  evaluate: ({ signals }) => {
    const c = signals?.content;
    if (!c || !isKnown(c)) return c ? missing("Données YouTube indisponibles.", c) : { status: "DATA_INSUFFICIENT", explanation: "Données YouTube indisponibles.", missing: ["youtube-data"] };
    const median = c.value.medianViews;
    if (median === null) return { status: "DATA_INSUFFICIENT", explanation: "Aucune vidéo récente sur le produit dans ce pays.", missing: [] };
    return scored(log10Scale(Math.max(1, median), B.videoMedianViewsLog10.min, B.videoMedianViewsLog10.max), "Vues médianes des vidéos pertinentes de l'année (log) : 1 000 → 0, 1 000 000 → 1.", [c], {
      rawValue: median,
      rawLabel: `${fmt.format(median)} vues médianes`,
    });
  },
};

const marketMargin: Criterion = {
  id: "market_margin",
  label: "Marge au prix du marché",
  timeSensitive: false,
  evaluate: ({ signals }) => {
    const m = signals?.marketMarginPct;
    if (!m || !isKnown(m)) return m ? missing("Marge au prix du marché non calculable.", m) : { status: "DATA_INSUFFICIENT", explanation: "Marge au prix du marché non calculable.", missing: ["ebay-browse"] };
    return scored(linearScale(m.value, B.marketMarginPct.min, B.marketMarginPct.max), "(Prix eBay médian HT − coût unitaire droits inclus) / prix : 10 % → 0, 60 % → 1, avant publicité.", [m], {
      rawValue: m.value,
      rawLabel: `${fmt.format(m.value)} % de marge brute`,
    });
  },
};

/** Ordered registry — the order is the display order. */
export const DEFAULT_CRITERIA: readonly Criterion[] = [
  demandVolume,
  demandTrend,
  demandOutlook,
  seasonalityTiming,
  searchIntent,
  videoInterest,
  competitionCurrent,
  competitionTrend,
  adCost,
  marketContext,
  unitEconomics,
  marketMargin,
];

export type { ScoringContext };
