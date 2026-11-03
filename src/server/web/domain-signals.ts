import "server-only";
import { z } from "zod";
import type { DomainSignals } from "@/domain/competitor";
import { USER_AGENT } from "@/providers/http";
import type { ProviderCacheRepository } from "@/server/repositories/types";

/**
 * The age and popularity of a shop's domain, from three free public registries that need no key:
 * RDAP (registration date), the Internet Archive (first page kept, months kept) and the Tranco list of
 * the million most visited sites. Only the domain name is sent. Kept seven days.
 */

const TIMEOUT_MS = 8_000;
const CACHE_TTL_S = 7 * 24 * 60 * 60;
const DOMAIN = /^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** A month earlier in Tranco's daily ranks, to tell a rise from a fall. */
const TREND_DAYS = 30;

export type SignalPart = "read" | "absent" | "failed";

export interface DomainSignalsRead {
  readonly signals: DomainSignals;
  readonly parts: { readonly rdap: SignalPart; readonly archive: SignalPart; readonly tranco: SignalPart };
}

export interface DomainSignalDeps {
  readonly fetch: typeof fetch;
  readonly cache?: ProviderCacheRepository | null;
}

const DEFAULT_DEPS: DomainSignalDeps = { fetch: (input, init) => fetch(input, init) };

export function isDomainName(domain: string): boolean {
  return DOMAIN.test(domain);
}

async function getJson(url: string, deps: DomainSignalDeps): Promise<{ ok: true; body: unknown } | { ok: false; missing: boolean }> {
  try {
    const response = await deps.fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/rdap+json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", redirect: "follow" });
    if (response.status === 404) return { ok: false, missing: true };
    if (!response.ok) return { ok: false, missing: false };
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, missing: false };
  }
}

const rdapSchema = z.object({ events: z.array(z.object({ eventAction: z.string(), eventDate: z.string() })).default([]) });

export function parseRdap(body: unknown): string | null {
  const parsed = rdapSchema.safeParse(body);
  const date = parsed.success ? parsed.data.events.find((e) => e.eventAction === "registration")?.eventDate : undefined;
  return date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
}

/** CDX rows: a header row, then one timestamp (YYYYMMDDhhmmss) per month kept. */
export function parseArchive(body: unknown): { readonly first: string | null; readonly months: number } {
  const rows = z.array(z.array(z.string())).safeParse(body);
  if (!rows.success) return { first: null, months: 0 };
  const stamps = rows.data.slice(1).map((row) => row[0] ?? "").filter((stamp) => /^\d{14}$/.test(stamp));
  const first = stamps[0];
  return {
    first: first ? `${first.slice(0, 4)}-${first.slice(4, 6)}-${first.slice(6, 8)}T${first.slice(8, 10)}:${first.slice(10, 12)}:${first.slice(12, 14)}Z` : null,
    months: stamps.length,
  };
}

const trancoSchema = z.object({ ranks: z.array(z.object({ date: z.string(), rank: z.number().int() })).default([]) });

export function parseTranco(body: unknown): { readonly rank: number | null; readonly before: number | null; readonly listed: boolean } | null {
  const parsed = trancoSchema.safeParse(body);
  if (!parsed.success) return null;
  const ranks = [...parsed.data.ranks].sort((a, b) => b.date.localeCompare(a.date));
  const latest = ranks[0];
  if (!latest) return { rank: null, before: null, listed: false };
  const target = Date.parse(latest.date) - TREND_DAYS * 86_400_000;
  const before = ranks.find((r) => Date.parse(r.date) <= target);
  return { rank: latest.rank, before: before?.rank ?? null, listed: true };
}

export async function readDomainSignals(domain: string, deps: DomainSignalDeps = DEFAULT_DEPS): Promise<DomainSignalsRead | null> {
  const name = domain.toLowerCase().replace(/^www\./, "");
  if (!isDomainName(name)) return null;
  const key = `domain-signals:${name}`;
  const kept = await deps.cache?.get(key).catch(() => null);
  if (kept && typeof kept === "object" && "signals" in kept) return kept as DomainSignalsRead;

  const [rdap, archive, tranco] = await Promise.all([
    getJson(`https://rdap.org/domain/${encodeURIComponent(name)}`, deps),
    getJson(`https://web.archive.org/cdx/search/cdx?${new URLSearchParams({ url: name, output: "json", fl: "timestamp", collapse: "timestamp:6", limit: "1000" })}`, deps),
    getJson(`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(name)}`, deps),
  ]);
  const registeredAt = rdap.ok ? parseRdap(rdap.body) : null;
  const archived = archive.ok ? parseArchive(archive.body) : { first: null, months: 0 };
  const ranked = tranco.ok ? parseTranco(tranco.body) : null;
  const part = (answer: typeof rdap, found: boolean): SignalPart => (answer.ok ? (found ? "read" : "absent") : answer.missing ? "absent" : "failed");

  const result: DomainSignalsRead = {
    signals: {
      registeredAt,
      firstArchivedAt: archived.first,
      archivedMonths: archive.ok ? archived.months : null,
      trancoRank: ranked?.rank ?? null,
      outsideTranco: ranked !== null && !ranked.listed,
      trancoRankBefore: ranked?.before ?? null,
    },
    // Not among Tranco's million sites is an answer, shown as such; the source itself holds nothing on the domain.
    parts: { rdap: part(rdap, registeredAt !== null), archive: part(archive, archived.first !== null), tranco: part(tranco, ranked?.listed === true) },
  };
  // A registry that failed is asked again next time; a complete answer is kept.
  if (rdap.ok && archive.ok && tranco.ok) await deps.cache?.set(key, "domain-signals", result, CACHE_TTL_S).catch(() => undefined);
  return result;
}
