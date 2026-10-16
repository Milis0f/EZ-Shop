import { and, eq, gt } from "drizzle-orm";
import type { Database } from "../db/client";
import { providerCache } from "../db/schema";
import type { ProviderCacheRepository } from "./types";

export class DrizzleCacheRepository implements ProviderCacheRepository {
  constructor(private readonly db: Database) {}

  async get(key: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ payload: providerCache.payload })
      .from(providerCache)
      .where(and(eq(providerCache.cacheKey, key), gt(providerCache.expiresAt, new Date())))
      .limit(1);
    return row ? row.payload : null;
  }

  async set(key: string, providerId: string, payload: unknown, ttlSeconds: number): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    await this.db
      .insert(providerCache)
      .values({ cacheKey: key, providerId, payload, fetchedAt: now, expiresAt })
      .onConflictDoUpdate({ target: providerCache.cacheKey, set: { payload, fetchedAt: now, expiresAt } });
  }
}
