import "server-only";
import { getDb } from "../db/client";
import { DrizzleAnalysisRepository } from "./drizzle-analysis-repository";
import { DrizzleCacheRepository } from "./drizzle-cache-repository";
import type { Repositories } from "./types";

export async function getRepositories(): Promise<Repositories> {
  const db = await getDb();
  return { analyses: new DrizzleAnalysisRepository(db), cache: new DrizzleCacheRepository(db) };
}

export type * from "./types";
