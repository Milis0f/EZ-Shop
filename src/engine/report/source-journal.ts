import type { AnalysisResult } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { PROVIDER_IDS, type ProviderId, type SourceRef } from "@/domain/provenance";
import { SOURCE_LABELS } from "@/lib/format";

/**
 * Readable journal of the data sources of one analysis, for the expert mode.
 * Built only from what the analysis already stores: the sources of every datum, the collection
 * issues and the provider snapshots. Nothing is fetched and no date is made up.
 */

export type JournalStatus = "used" | "failed" | "not_configured" | "not_implemented";

export interface JournalRow {
  readonly providerId: ProviderId;
  readonly name: string;
  readonly countries: CountryCode[];
  readonly status: JournalStatus;
  /** Collection issue code, on failed rows only. */
  readonly errorCode?: string;
  /** Oldest collection date among the sources, on used rows only: a cached value never looks fresher than it is. */
  readonly collectedAt?: string;
}

interface Entry {
  readonly providerId: ProviderId;
  readonly status: JournalStatus;
  readonly errorCode?: string;
  readonly country: CountryCode;
  readonly collectedAt?: string;
}

const STATUS_ORDER: readonly JournalStatus[] = ["used", "failed", "not_configured", "not_implemented"];
const UNSET_STATUSES: ReadonlySet<string> = new Set<JournalStatus>(["not_configured", "not_implemented"]);
const PROVIDERS: ReadonlySet<string> = new Set(PROVIDER_IDS);

const isRecord = (node: unknown): node is Record<string, unknown> => typeof node === "object" && node !== null;

/** Sources of every known datum found anywhere in a stored value (datums nest inside other datums). */
function datumSources(node: unknown): SourceRef[] {
  if (Array.isArray(node)) return node.flatMap(datumSources);
  if (!isRecord(node)) return [];
  const own = node.status === "known" && Array.isArray(node.sources) ? (node.sources as SourceRef[]) : [];
  return [...own, ...Object.values(node).flatMap(datumSources)];
}

/** Only real collections count as use: mocks, typed values and default assumptions are not a provider. */
const usedEntries = (node: unknown, countries: readonly CountryCode[]): Entry[] =>
  datumSources(node)
    .filter((s) => s.origin === "live" && PROVIDERS.has(s.sourceId))
    .flatMap((s) => countries.map((country) => ({ providerId: s.sourceId as ProviderId, status: "used" as const, country, collectedAt: s.collectedAt })));

function collectEntries(analysis: AnalysisResult): Entry[] {
  const everyCountry = analysis.input.countries;
  const perCountry = analysis.countries.flatMap((c) => [
    ...usedEntries(c, [c.country]),
    ...c.issues.map((issue): Entry =>
      UNSET_STATUSES.has(issue.code)
        ? { providerId: issue.providerId, status: issue.code as JournalStatus, country: c.country }
        : { providerId: issue.providerId, status: "failed", errorCode: issue.code, country: c.country },
    ),
  ]);
  // Analysis-level data (absent before the context column existed) serves every analysed country.
  const analysisLevel = usedEntries([analysis.sourcing, analysis.classification], everyCountry);
  // A provider-wide state holds for every country, including the ones it was never called for.
  const unset = analysis.providers
    .filter((p) => UNSET_STATUSES.has(p.state))
    .flatMap((p) => everyCountry.map((country): Entry => ({ providerId: p.providerId, status: p.state as JournalStatus, country })));
  return [...perCountry, ...analysisLevel, ...unset];
}

const oldest = (a: string | undefined, b: string | undefined): string | undefined =>
  a === undefined ? b : b === undefined ? a : Date.parse(b) < Date.parse(a) ? b : a;

const rank = (list: readonly string[], value: string): number => {
  const index = list.indexOf(value);
  return index === -1 ? list.length : index;
};

export function sourceJournal(analysis: AnalysisResult): JournalRow[] {
  const countryOrder = analysis.input.countries;
  const groups = new Map<string, { readonly first: Entry; readonly countries: Set<CountryCode>; collectedAt?: string }>();
  for (const entry of collectEntries(analysis)) {
    const key = [entry.providerId, entry.status, entry.errorCode ?? ""].join("|");
    const group = groups.get(key) ?? { first: entry, countries: new Set<CountryCode>() };
    group.countries.add(entry.country);
    group.collectedAt = oldest(group.collectedAt, entry.collectedAt);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ first, countries, collectedAt }): JournalRow => ({
      providerId: first.providerId,
      name: SOURCE_LABELS[first.providerId] ?? first.providerId,
      countries: [...countries].toSorted((a, b) => rank(countryOrder, a) - rank(countryOrder, b)),
      status: first.status,
      ...(first.errorCode !== undefined ? { errorCode: first.errorCode } : {}),
      ...(collectedAt !== undefined ? { collectedAt } : {}),
    }))
    .toSorted(
      (a, b) =>
        rank(PROVIDER_IDS, a.providerId) - rank(PROVIDER_IDS, b.providerId) || rank(STATUS_ORDER, a.status) - rank(STATUS_ORDER, b.status),
    );
}
