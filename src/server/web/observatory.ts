import "server-only";
import type { ShopHistory } from "@/domain/competitor";
import { buildHistory } from "@/engine/competitor/observatory";
import { asWatchRecord, BASELINE_MS, type WatchSnapshot } from "@/engine/competitor/watch";
import type { CompetitorReadingRepository } from "@/server/repositories/competitor-readings";
import type { ProviderCacheRepository } from "@/server/repositories/types";

/**
 * Keeps a dated reading of the shop's catalogue (at most one per six hours) and rebuilds its history
 * from every reading kept. The first time a shop is seen here, the reading kept by the older watch
 * (in the cache) becomes its first point, so no past check is lost. A failure never stops the report.
 */

export const HISTORY_READINGS = 120;

export interface ObserveInput {
  readonly domain: string;
  readonly snapshot: WatchSnapshot;
  /** The whole catalogue was read. */
  readonly complete: boolean;
  readonly extra: Readonly<Record<string, unknown>>;
  readonly nowMs: number;
}

async function importLegacy(domain: string, repo: CompetitorReadingRepository, cache: ProviderCacheRepository | null): Promise<void> {
  if (!cache) return;
  const record = asWatchRecord(await cache.get(`competitor-watch:${domain}`));
  if (!record) return;
  // Whether that reading covered the whole catalogue is not known: it never counts a product as gone.
  await repo.add({ domain, observedAt: record.baseline.at, snapshot: record.baseline, complete: false, extra: { importedFrom: "watch" } });
}

export async function observe(input: ObserveInput, repo: CompetitorReadingRepository | null, cache: ProviderCacheRepository | null): Promise<ShopHistory | null> {
  if (!repo) return null;
  try {
    let latest = await repo.latest(input.domain);
    if (!latest) {
      await importLegacy(input.domain, repo, cache);
      latest = await repo.latest(input.domain);
    }
    const due = !latest || input.nowMs - Date.parse(latest.observedAt) >= BASELINE_MS;
    if (due && input.snapshot.products.length > 0) {
      await repo.add({ domain: input.domain, observedAt: new Date(input.nowMs).toISOString(), snapshot: input.snapshot, complete: input.complete, extra: input.extra });
    }
    const readings = await repo.list(input.domain, HISTORY_READINGS);
    if (readings.length === 0) return null;
    const history = buildHistory(readings.map((r) => ({ at: r.observedAt, snapshot: r.snapshot, complete: r.complete })));
    return { ...history, series: [...history.series], events: [...history.events], counts: { ...history.counts } };
  } catch (error: unknown) {
    console.error("[observatory] reading not kept", error instanceof Error ? error.name : typeof error);
    return null;
  }
}
