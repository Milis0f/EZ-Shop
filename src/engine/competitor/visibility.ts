import { sourced, type SourcedValue } from "@/domain/data-nature";
import type { DomainSignals, Visibility } from "@/domain/competitor";

/**
 * The visibility profile: how present a shop is on the web, from published indicators only. It never
 * gives a number of visits. The level is EZ-Shop's reading of the indicators (inferred), and needs at
 * least two of them to have answered.
 */

type Level = NonNullable<Visibility["level"]>;
const ORDER: readonly Level[] = ["low", "medium", "high"];
export const MIN_INDICATORS = 2;

/** Tranco and the Internet Archive, already read with the domain registries, as sourced values. */
export function registryIndicators(signals: DomainSignals | null, observedAt: string): SourcedValue[] {
  if (!signals) return [];
  const base = { observedAt, periodStart: null, periodEnd: null } as const;
  const tranco =
    signals.trancoRank !== null
      ? sourced({ ...base, metric: "tranco_rank", value: signals.trancoRank, unit: "rank", nature: "published", coverage: "available", source: "tranco", sourceUrl: "https://tranco-list.eu/", attribution: "Tranco" })
      : signals.outsideTranco
        ? sourced({ ...base, metric: "tranco_rank", value: null, unit: "rank", nature: "published", coverage: "not_covered", source: "tranco", sourceUrl: "https://tranco-list.eu/", attribution: "Tranco" })
        : null;
  const archive =
    signals.archivedMonths !== null
      ? sourced({ ...base, metric: "archive_months", value: signals.archivedMonths, unit: "months", nature: "observed", coverage: "available", source: "internet-archive", sourceUrl: "https://web.archive.org/", attribution: null })
      : null;
  return [tranco, archive].filter((v): v is SourcedValue => v !== null);
}

/** The level one indicator points to; null when it says nothing about visibility. */
export function levelOf(value: SourcedValue): Level | null {
  if (value.metric === "tranco_rank") {
    if (value.coverage === "not_covered") return "low";
    if (value.value === null) return null;
    return value.value <= 100_000 ? "high" : "medium";
  }
  if (value.metric === "crux_presence") {
    if (value.coverage === "not_covered") return "low";
    return value.coverage === "available" ? "medium" : null;
  }
  if (value.value === null) return null;
  if (value.metric === "ahrefs_domain_rating") return value.value >= 50 ? "high" : value.value >= 20 ? "medium" : "low";
  if (value.metric === "open_page_rank") return value.value >= 5 ? "high" : value.value >= 3 ? "medium" : "low";
  return null;
}

export function visibilityOf(indicators: readonly SourcedValue[], notConfigured: readonly string[]): Visibility {
  const levels = indicators.flatMap((v) => {
    const level = levelOf(v);
    return level ? [{ metric: v.metric, level }] : [];
  });
  let level: Level | null = null;
  if (levels.length >= MIN_INDICATORS) {
    // The median level: one strong indicator does not lift the profile alone.
    const sorted = levels.map((l) => ORDER.indexOf(l.level)).sort((a, b) => a - b);
    level = ORDER[sorted[Math.floor((sorted.length - 1) / 2)]];
  }
  return { indicators: [...indicators], level, basis: levels.map((l) => l.metric), notConfigured: [...notConfigured] };
}
