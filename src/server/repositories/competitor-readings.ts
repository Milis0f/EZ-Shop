import { desc, eq, sql } from "drizzle-orm";
import type { WatchSnapshot } from "@/engine/competitor/watch";
import type { Database } from "../db/client";
import { competitorReadings } from "../db/schema";

/** One dated reading of a shop's public catalogue, as the observatory keeps it. */
export interface StoredReading {
  readonly domain: string;
  readonly observedAt: string;
  readonly snapshot: WatchSnapshot;
  readonly complete: boolean;
  /** Side readings of the same check; validate before use. */
  readonly extra: Readonly<Record<string, unknown>>;
}

export interface WatchedShop {
  readonly domain: string;
  readonly readings: number;
  readonly firstAt: string;
  readonly lastAt: string;
}

export interface CompetitorReadingRepository {
  add(reading: StoredReading): Promise<void>;
  /** Most recent first. */
  list(domain: string, limit: number): Promise<StoredReading[]>;
  latest(domain: string): Promise<StoredReading | null>;
  shops(limit: number): Promise<WatchedShop[]>;
}

const asSnapshot = (value: unknown, at: string): WatchSnapshot | null => {
  if (!value || typeof value !== "object") return null;
  const products = (value as { products?: unknown }).products;
  return Array.isArray(products) ? { at, products: products as WatchSnapshot["products"] } : null;
};

const asExtra = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export class DrizzleCompetitorReadingRepository implements CompetitorReadingRepository {
  constructor(private readonly db: Database) {}

  async add(reading: StoredReading): Promise<void> {
    await this.db.insert(competitorReadings).values({
      domain: reading.domain,
      observedAt: new Date(reading.observedAt),
      productCount: reading.snapshot.products.length,
      snapshot: { products: reading.snapshot.products },
      extra: { ...reading.extra, complete: reading.complete },
    });
  }

  async list(domain: string, limit: number): Promise<StoredReading[]> {
    const rows = await this.db.select().from(competitorReadings).where(eq(competitorReadings.domain, domain)).orderBy(desc(competitorReadings.observedAt)).limit(limit);
    return rows.flatMap((row) => {
      const at = row.observedAt.toISOString();
      const snapshot = asSnapshot(row.snapshot, at);
      if (!snapshot) return [];
      const extra = asExtra(row.extra);
      return [{ domain: row.domain, observedAt: at, snapshot, complete: extra.complete === true, extra }];
    });
  }

  async latest(domain: string): Promise<StoredReading | null> {
    return (await this.list(domain, 1))[0] ?? null;
  }

  async shops(limit: number): Promise<WatchedShop[]> {
    const rows = await this.db
      .select({
        domain: competitorReadings.domain,
        readings: sql<number>`count(*)::int`,
        firstAt: sql<Date>`min(${competitorReadings.observedAt})`,
        lastAt: sql<Date>`max(${competitorReadings.observedAt})`,
      })
      .from(competitorReadings)
      .groupBy(competitorReadings.domain)
      .orderBy(desc(sql`max(${competitorReadings.observedAt})`))
      .limit(limit);
    return rows.map((r) => ({ domain: r.domain, readings: Number(r.readings), firstAt: new Date(r.firstAt).toISOString(), lastAt: new Date(r.lastAt).toISOString() }));
  }
}

/** In-memory, for tests. */
export class MemoryCompetitorReadingRepository implements CompetitorReadingRepository {
  private readonly rows: StoredReading[] = [];

  async add(reading: StoredReading): Promise<void> {
    this.rows.push(reading);
  }

  async list(domain: string, limit: number): Promise<StoredReading[]> {
    return this.rows.filter((r) => r.domain === domain).sort((a, b) => b.observedAt.localeCompare(a.observedAt)).slice(0, limit);
  }

  async latest(domain: string): Promise<StoredReading | null> {
    return (await this.list(domain, 1))[0] ?? null;
  }

  async shops(limit: number): Promise<WatchedShop[]> {
    const byDomain = new Map<string, StoredReading[]>();
    for (const row of this.rows) byDomain.set(row.domain, [...(byDomain.get(row.domain) ?? []), row]);
    return [...byDomain.entries()]
      .map(([domain, rows]) => {
        const ats = rows.map((r) => r.observedAt).sort();
        return { domain, readings: rows.length, firstAt: ats[0], lastAt: ats[ats.length - 1] };
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
      .slice(0, limit);
  }
}
