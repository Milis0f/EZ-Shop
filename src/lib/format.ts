import type { ProviderState } from "@/domain/analysis";
import type { ValueKind } from "@/domain/datum";
import type { CompetitionLevel, CompetitionOutlook, TrendDirection } from "@/domain/market";
import type { SourceId } from "@/domain/provenance";
import type { ConfidenceLevel, Decision } from "@/domain/scoring";
import type { VerificationLevel } from "@/providers/contracts";

/** French display formatting and vocabulary. One place, so labels stay consistent everywhere. */

const integer = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const decimal1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export const formatInt = (v: number): string => integer.format(v);
/** Compact for large values, one decimal below 10 so small estimates are not rounded to zero. */
export const formatCompact = (v: number): string =>
  Math.abs(v) >= 10_000 ? compact.format(v) : Math.abs(v) < 10 ? decimal1.format(v) : integer.format(v);
export const formatDecimal = (v: number): string => decimal1.format(v);
export const formatPct = (v: number, signed = false): string => `${signed && v > 0 ? "+" : ""}${decimal1.format(v)} %`;
export const formatRatioPct = (v: number): string => `${decimal1.format(v * 100)} %`;

export function formatMoney(v: number, currency = "EUR"): string {
  const digits = Math.abs(v) < 10 ? 2 : 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
}

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export const KIND_LABELS: Record<ValueKind | "insufficient" | "mock", string> = {
  observed: "Donnée observée",
  derived: "Calcul dérivé",
  estimate: "Estimation",
  assumption: "Hypothèse",
  insufficient: "Donnée insuffisante",
  mock: "Donnée fictive (mock)",
};

export const KIND_HINTS: Record<ValueKind | "insufficient" | "mock", string> = {
  observed: "Mesurée par une source externe, non transformée.",
  derived: "Calcul déterministe à partir de données observées.",
  estimate: "Projection de modèle, avec incertitude.",
  assumption: "Paramètre choisi, non mesuré.",
  insufficient: "Aucune estimation fiable possible : rien n'est affiché à la place.",
  mock: "Valeur synthétique de développement, sans rapport avec le marché.",
};

export const DECISION_LABELS: Record<Decision, string> = {
  prioritize: "Prioriser",
  test_carefully: "Tester prudemment",
  avoid: "Éviter",
  exploratory_only: "Exploratoire seulement",
  insufficient_data: "Données insuffisantes",
};

export const DECISION_HINTS: Record<Decision, string> = {
  prioritize: "Score élevé et confiance suffisante.",
  test_carefully: "Potentiel correct : test à petit budget.",
  avoid: "Score faible au vu des données disponibles.",
  exploratory_only: "Confiance trop faible pour décider : à compléter.",
  insufficient_data: "Pas assez de données pour calculer un score.",
};

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "Élevée",
  medium: "Moyenne",
  low: "Faible",
  very_low: "Très faible",
};

export const TREND_LABELS: Record<TrendDirection, string> = { rising: "En hausse", stable: "Stable", declining: "En baisse" };

export const COMPETITION_LABELS: Record<CompetitionLevel, string> = {
  low: "Faible",
  moderate: "Modérée",
  high: "Forte",
  very_high: "Très forte",
};

export const OUTLOOK_LABELS: Record<CompetitionOutlook, string> = {
  decreasing: "En baisse",
  stable: "Stable",
  increasing: "En hausse",
  surging: "Explosive",
};

export const PROVIDER_STATE_LABELS: Record<ProviderState, string> = {
  ready: "Prêt",
  not_configured: "Non configuré",
  not_implemented: "À implémenter",
  mock: "Mock",
};

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  live_verified: "Vérifié en réel",
  documented_unverified: "Écrit d'après la doc, non vérifié",
  not_implemented: "Contrat seulement",
};

export const PLATFORM_LABELS = { google: "Google Ads", meta: "Meta", tiktok: "TikTok" } as const;

export const SOURCE_LABELS: Record<SourceId, string> = {
  "google-trends": "Google Trends",
  "google-ads-keyword-planner": "Google Ads Keyword Planner",
  "meta-ad-library": "Meta Ad Library",
  "tiktok-commercial-content": "TikTok Commercial Content",
  "meta-marketing-api": "Meta Marketing API",
  "tiktok-business-api": "TikTok API for Business",
  "world-bank": "Banque mondiale",
  eurostat: "Eurostat",
  oecd: "OCDE",
  "google-autocomplete": "Google Autocomplete",
  wikimedia: "Wikipédia (audiences)",
  "youtube-data": "YouTube Data API",
  "ebay-browse": "eBay Browse API",
  "aliexpress-affiliate": "AliExpress Affiliate API",
  "uk-trade-tariff": "Tarif douanier (UK / UE)",
  "usitc-hts": "Tarif douanier des États-Unis (USITC)",
  "vat-rates": "Taux de TVA",
  "ecb-fx": "Taux de change BCE",
  mymemory: "Traduction automatique (MyMemory)",
  "user-input": "Saisie utilisateur",
  assumptions: "Hypothèses",
};

const MISSING_LABELS: Readonly<Record<string, string>> = {
  selling_price: "Prix de vente",
  landed_cost: "Coût de revient",
  translated_terms: "Termes traduits",
  origin_country: "Pays d'origine",
  hs_code: "Code douanier (SH)",
  english_term: "Terme en anglais",
  ebay_national_site: "Site eBay national",
};

/** Labels for the machine-readable `missing` entries of DATA_INSUFFICIENT values. */
export const missingLabel = (key: string): string => SOURCE_LABELS[key as SourceId] ?? MISSING_LABELS[key] ?? key;
