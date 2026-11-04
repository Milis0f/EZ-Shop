import "server-only";
import { getDb } from "../db/client";
import { DrizzleAnalysisRepository } from "./drizzle-analysis-repository";
import { type CompetitorReadingRepository, DrizzleCompetitorReadingRepository } from "./competitor-readings";
import { DrizzleCacheRepository } from "./drizzle-cache-repository";
import { DrizzleResearchRunRepository } from "./research-runs";
import type { Repositories } from "./types";

export async function getRepositories(): Promise<Repositories> {
  const db = await getDb();
  return { analyses: new DrizzleAnalysisRepository(db), cache: new DrizzleCacheRepository(db), runs: new DrizzleResearchRunRepository(db) };
}

/** The competitor observatory: dated readings of the shops checked on this computer. */
export async function getCompetitorReadings(): Promise<CompetitorReadingRepository> {
  return new DrizzleCompetitorReadingRepository(await getDb());
}

export type * from "./types";
