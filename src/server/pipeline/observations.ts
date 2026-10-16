import type { CountryCode } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import type { ProviderId, SourceRef } from "@/domain/provenance";
import type { CountrySignals } from "@/engine/analyze-country";
import type { MacroObservation } from "@/providers/contracts";
import type { CompetitionSnapshotRecord, ObservationRecord } from "../repositories/types";

/** Flatten collected signals into audit rows (one row per raw value). */

const record = (
  country: CountryCode,
  source: SourceRef,
  metric: string,
  value: number,
  unit: string,
  extra: Partial<ObservationRecord> = {},
): ObservationRecord => ({
  providerId: source.sourceId as ProviderId,
  country,
  metric,
  value,
  unit,
  origin: source.origin,
  queryRef: source.queryRef,
  sourceUrl: source.sourceUrl,
  connectorVersion: source.connectorVersion,
  collectedAt: source.collectedAt,
  periodStart: source.period?.start,
  periodEnd: source.period?.end,
  ...extra,
});

export function observationsFor(signals: CountrySignals, macro: readonly MacroObservation[]): ObservationRecord[] {
  const { country } = signals;
  const rows: ObservationRecord[] = [];

  if (isKnown(signals.keywordMetrics)) {
    for (const m of signals.keywordMetrics.value) {
      const term = { term: m.term };
      for (const p of m.monthlyVolumes) {
        rows.push(record(country, m.source, "search_volume", p.value, "searches_per_month", { ...term, periodStart: p.month, periodEnd: p.month }));
      }
      if (m.avgMonthlySearches !== null) rows.push(record(country, m.source, "avg_monthly_searches", m.avgMonthlySearches, "searches_per_month", term));
      if (m.competitionIndex !== null) rows.push(record(country, m.source, "google_competition_index", m.competitionIndex, "index_0_100", term));
      if (m.lowTopOfPageBid !== null) rows.push(record(country, m.source, "top_of_page_bid_low", m.lowTopOfPageBid, m.currency, term));
      if (m.highTopOfPageBid !== null) rows.push(record(country, m.source, "top_of_page_bid_high", m.highTopOfPageBid, m.currency, term));
    }
  }

  if (isKnown(signals.searchInterest)) {
    for (const s of signals.searchInterest.value) {
      for (const p of s.points) {
        rows.push(record(country, s.source, "search_interest_index", p.value, "index_0_100", { term: s.term, periodStart: p.month, periodEnd: p.month }));
      }
    }
  }

  for (const activity of [signals.adActivity.meta, signals.adActivity.tiktok]) {
    if (!isKnown(activity)) continue;
    const { source } = activity.value;
    rows.push(record(country, source, "active_ads", activity.value.activeAds, "count"));
    rows.push(record(country, source, "unique_advertisers", activity.value.uniqueAdvertisers, "count"));
    for (const w of activity.value.newAdsByWeek) {
      rows.push(record(country, source, "new_ads_per_week", w.count, "count", { periodStart: w.weekStart, periodEnd: w.weekStart }));
    }
  }

  for (const cost of [signals.adCosts.meta, signals.adCosts.tiktok]) {
    if (!isKnown(cost)) continue;
    const { source, metric, currency, low, high } = cost.value;
    rows.push(record(country, source, `${metric}_low`, low, currency));
    rows.push(record(country, source, `${metric}_high`, high, currency));
  }

  for (const m of macro) if (m.country === country) rows.push(record(country, m.source, m.indicator, m.value, "indicator"));
  return rows;
}

export function snapshotsFor(signals: CountrySignals): CompetitionSnapshotRecord[] {
  return [signals.adActivity.meta, signals.adActivity.tiktok].flatMap((a) =>
    isKnown(a)
      ? [{
          providerId: a.value.source.sourceId as ProviderId,
          country: signals.country,
          activeAds: a.value.activeAds,
          uniqueAdvertisers: a.value.uniqueAdvertisers,
          origin: a.value.source.origin,
        }]
      : [],
  );
}
