import { and, asc, desc, eq, inArray, lt, sql, type SQL } from "drizzle-orm";
import { RUN_KINDS, RUN_STATUSES, type RunKind, type RunStatus } from "@/domain/history";
import type { Database } from "../db/client";
import { researchRuns } from "../db/schema";
import type { NewRun, RunFinish, RunListQuery, RunRecord, ResearchRunRepository } from "./types";

const isKind = (v: string): v is RunKind => (RUN_KINDS as readonly string[]).includes(v);
const isStatus = (v: string): v is RunStatus => (RUN_STATUSES as readonly string[]).includes(v);

/**
 * `%` and `_` typed in a search are letters, not patterns. The escape character is stated: PGlite
 * does not honour LIKE's default backslash escape the way Postgres does.
 */
const titleContains = (q: string): SQL => sql`${researchRuns.title} ILIKE ${`%${q.replace(/[!%_]/g, (c) => `!${c}`)}%`} ESCAPE '!'`;

type Row = typeof researchRuns.$inferSelect;

/** A row read back; one whose kind or status the code does not know is skipped, never guessed. */
function toRecord(row: Row): RunRecord | null {
  if (!isKind(row.kind) || !isStatus(row.status)) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    locale: row.locale,
    countries: row.countries,
    params: row.params,
    result: row.result ?? null,
    sourceCount: row.sourceCount,
    model: row.model,
    error: row.error,
    progress: row.progress,
    step: row.step,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export class DrizzleResearchRunRepository implements ResearchRunRepository {
  constructor(private readonly db: Database) {}

  async start(run: NewRun): Promise<string> {
    const now = new Date();
    const [row] = await this.db
      .insert(researchRuns)
      .values({ kind: run.kind, title: run.title, status: run.status ?? "running", locale: run.locale, countries: [...run.countries], params: run.params, createdAt: now, startedAt: run.status === "pending" ? null : now })
      .returning({ id: researchRuns.id });
    return row.id;
  }

  async finish(id: string, finish: RunFinish): Promise<void> {
    await this.db
      .update(researchRuns)
      .set({
        status: finish.status,
        result: finish.result ?? null,
        sourceCount: finish.sourceCount ?? null,
        model: finish.model ?? null,
        error: finish.error ?? null,
        durationMs: finish.durationMs ?? null,
        progress: finish.status === "completed" ? 1 : null,
        step: null,
        finishedAt: new Date(),
      })
      .where(eq(researchRuns.id, id));
  }

  async findById(id: string): Promise<RunRecord | null> {
    const [row] = await this.db.select().from(researchRuns).where(eq(researchRuns.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async list(query: RunListQuery): Promise<RunRecord[]> {
    const where: SQL[] = [];
    if (query.kind) where.push(eq(researchRuns.kind, query.kind));
    if (query.q) where.push(titleContains(query.q));
    const rows = await this.db
      .select()
      .from(researchRuns)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(query.order === "oldest" ? asc(researchRuns.createdAt) : desc(researchRuns.createdAt))
      .limit(query.limit);
    return rows.map(toRecord).filter((r): r is RunRecord => r !== null);
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(researchRuns).where(eq(researchRuns.id, id)).returning({ id: researchRuns.id });
    return rows.length > 0;
  }

  async markInterrupted(startedBefore: Date): Promise<number> {
    const rows = await this.db
      .update(researchRuns)
      .set({ status: "interrupted", finishedAt: new Date(), step: null })
      .where(and(eq(researchRuns.status, "running"), lt(researchRuns.startedAt, startedBefore)))
      .returning({ id: researchRuns.id });
    return rows.length;
  }

  async claimNext(): Promise<RunRecord | null> {
    // One worker per process and PGlite has one connection: the select-then-update cannot race.
    const next = this.db.select({ id: researchRuns.id }).from(researchRuns).where(eq(researchRuns.status, "pending")).orderBy(asc(researchRuns.createdAt)).limit(1);
    const [row] = await this.db
      .update(researchRuns)
      .set({ status: "running", startedAt: new Date(), progress: 0 })
      .where(and(eq(researchRuns.status, "pending"), inArray(researchRuns.id, next)))
      .returning();
    return row ? toRecord(row) : null;
  }

  async progress(id: string, progress: number, step: string | null): Promise<void> {
    await this.db
      .update(researchRuns)
      .set({ progress: Math.min(1, Math.max(0, progress)), step })
      .where(and(eq(researchRuns.id, id), eq(researchRuns.status, "running")));
  }

  async cancelPending(id: string): Promise<boolean> {
    const rows = await this.db
      .update(researchRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(researchRuns.id, id), eq(researchRuns.status, "pending")))
      .returning({ id: researchRuns.id });
    return rows.length > 0;
  }
}
