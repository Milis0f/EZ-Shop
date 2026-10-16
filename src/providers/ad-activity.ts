import type { WeeklyCount } from "@/domain/market";

/** Shared aggregation for ad-library adapters: raw ads → counts used by the engine. */

export interface RawAd {
  readonly id: string;
  readonly advertiserId: string;
  /** ISO date (YYYY-MM-DD) of first delivery. */
  readonly startDate: string;
  /** ISO date of last delivery; undefined when still running. */
  readonly stopDate?: string;
}

/** Monday (UTC) of the ISO week containing `isoDate`. */
export function weekStart(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export interface AggregatedActivity {
  readonly activeAds: number;
  readonly uniqueAdvertisers: number;
  readonly newAdsByWeek: WeeklyCount[];
}

export function aggregateAds(ads: readonly RawAd[], today: string, since: string): AggregatedActivity {
  const unique = new Map(ads.map((ad) => [ad.id, ad]));
  const active = [...unique.values()].filter((ad) => !ad.stopDate || ad.stopDate >= today);

  const weekly = new Map<string, number>();
  for (const ad of unique.values()) {
    if (ad.startDate < since) continue;
    const week = weekStart(ad.startDate);
    weekly.set(week, (weekly.get(week) ?? 0) + 1);
  }
  // Fill empty weeks with zero so the trend fit sees real gaps, not missing points.
  const newAdsByWeek: WeeklyCount[] = [];
  for (let w = weekStart(since); w <= weekStart(today); w = addDays(w, 7)) {
    newAdsByWeek.push({ weekStart: w, count: weekly.get(w) ?? 0 });
  }

  return {
    activeAds: active.length,
    uniqueAdvertisers: new Set(active.map((ad) => ad.advertiserId)).size,
    newAdsByWeek,
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
