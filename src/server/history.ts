import "server-only";
import type { HistoryEntry, HistoryKind, HistoryQuery, RunStatus } from "@/domain/history";
import { getRepositories, type NewRun, type ResearchRunRepository, type RunFinish, type RunRecord } from "./repositories";

/**
 * The history of every research: product analyses (their own tables) and runs (`research_runs`)
 * listed together, searched, sorted, removed. Recording a run never stops the research itself: a
 * database that cannot be written is reported in the log and the report is still shown.
 */

/** Lines shown at most; the analyses scanned for a search (a local history stays far below). */
const SHOWN = 200;
const ANALYSES_SCANNED = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// When this server started: a run still "running" from before it was cut by a stop.
const globalForHistory = globalThis as unknown as { __ezShopStarted?: Date; __ezShopRunsSwept?: Promise<unknown> };
globalForHistory.__ezShopStarted ??= new Date();

function sweepInterrupted(runs: ResearchRunRepository): Promise<unknown> {
  globalForHistory.__ezShopRunsSwept ??= runs.markInterrupted(globalForHistory.__ezShopStarted ?? new Date()).catch((error: unknown) => {
    globalForHistory.__ezShopRunsSwept = undefined;
    throw error;
  });
  return globalForHistory.__ezShopRunsSwept;
}

export async function startRun(run: NewRun): Promise<string | null> {
  try {
    return await (await getRepositories()).runs.start(run);
  } catch (error: unknown) {
    console.error("[history] run not recorded", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

export async function finishRun(id: string | null, finish: RunFinish): Promise<void> {
  if (!id) return;
  try {
    await (await getRepositories()).runs.finish(id, finish);
  } catch (error: unknown) {
    console.error("[history] run not updated", error instanceof Error ? error.name : typeof error);
  }
}

/** A run done in one go (a competitor check, a web search): recorded once it is over. */
export async function recordRun(run: NewRun, finish: RunFinish): Promise<string | null> {
  const id = await startRun(run);
  await finishRun(id, finish);
  return id;
}

export async function getRun(id: string): Promise<RunRecord | null> {
  if (!UUID.test(id)) return null;
  const { runs } = await getRepositories();
  await sweepInterrupted(runs);
  return runs.findById(id);
}

const ANALYSIS_STATUS: Record<"running" | "completed" | "failed", RunStatus> = { running: "running", completed: "completed", failed: "failed" };

export async function listHistory(query: HistoryQuery): Promise<HistoryEntry[]> {
  const { analyses, runs } = await getRepositories();
  await sweepInterrupted(runs);
  const q = query.q?.toLowerCase();
  const wantAnalyses = !query.kind || query.kind === "analysis";
  const runKind = query.kind && query.kind !== "analysis" ? query.kind : undefined;
  const [analysisRows, runRows] = await Promise.all([
    wantAnalyses ? analyses.listRecent(ANALYSES_SCANNED) : Promise.resolve([]),
    query.kind === "analysis" ? Promise.resolve([]) : runs.list({ kind: runKind, q: query.q, order: query.order, limit: SHOWN }),
  ]);

  const entries: HistoryEntry[] = [
    ...analysisRows
      .filter((a) => !q || a.productName.toLowerCase().includes(q))
      .map((a) => ({
        id: a.id,
        kind: "analysis" as const,
        title: a.productName,
        createdAt: a.createdAt,
        status: ANALYSIS_STATUS[a.status],
        countries: a.verdict ? [a.verdict.country] : [],
        sourceCount: null,
        href: `/analyses/${a.id}`,
        ...(a.verdict && { verdict: a.verdict }),
      })),
    ...runRows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, createdAt: r.createdAt, status: r.status, countries: r.countries, sourceCount: r.sourceCount, href: `/analyses/runs/${r.id}` })),
  ];
  const sign = query.order === "oldest" ? 1 : -1;
  return entries.toSorted((a, b) => sign * a.createdAt.localeCompare(b.createdAt)).slice(0, SHOWN);
}

/** Removes one line of the history and what it holds. Nothing else is touched. */
export async function deleteHistoryEntry(kind: HistoryKind, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const { analyses, runs } = await getRepositories();
  return kind === "analysis" ? analyses.delete(id) : runs.delete(id);
}
