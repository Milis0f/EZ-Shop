import type { RunKind } from "@/domain/history";
import type { ResearchRunRepository, RunFinish, RunRecord } from "../repositories/types";

/**
 * The background worker: long research runs here, out of the page's request, so closing the tab or
 * reloading it changes nothing. Runs wait in `research_runs` (status "pending") and are taken one at a
 * time: the local AI generates one answer at a time anyway, and the web reads stay paced.
 *
 * A run that was running when the app stopped is marked interrupted at the next start and never
 * restarted on its own (the person decides); a pending one had not started, so the worker takes it.
 */

/** What a job says while it works: a share from 0 to 1, the step, and a detail for the page. */
export interface JobProgress {
  readonly progress: number;
  readonly step: string;
  readonly detail: string | null;
}

export interface JobContext {
  readonly run: RunRecord;
  readonly signal: AbortSignal;
  readonly report: (progress: JobProgress) => void;
}

/** Runs one job and says how it ended; it never throws (the worker turns a throw into "failed"). */
export type JobHandler = (context: JobContext) => Promise<RunFinish>;

export interface WorkerDeps {
  readonly runs: () => Promise<ResearchRunRepository>;
  readonly handlers: Partial<Record<RunKind, JobHandler>>;
}

/** The step column holds the step and its detail as JSON: `{"step":"read","detail":"decathlon.fr"}`. */
export const encodeStep = (progress: JobProgress): string => JSON.stringify({ step: progress.step, detail: progress.detail });

export interface Worker {
  /** Looks for pending runs now (after a new one is queued, or at start). */
  kick(): void;
  /** Stops a run: a pending one is cancelled at once, a running one is asked to stop. */
  cancel(id: string): Promise<boolean>;
  /** The id of the run under way, if any. */
  current(): string | null;
  /** Resolves once nothing is left to take (tests). */
  idle(): Promise<void>;
}

export function createWorker(deps: WorkerDeps): Worker {
  let loop: Promise<void> | null = null;
  let again = false;
  let running: { readonly id: string; readonly abort: AbortController } | null = null;

  async function runOne(runs: ResearchRunRepository, run: RunRecord): Promise<void> {
    const handler = deps.handlers[run.kind];
    if (!handler) {
      await runs.finish(run.id, { status: "failed", error: "no_handler" });
      return;
    }
    const abort = new AbortController();
    running = { id: run.id, abort };
    // Progress is written in order, one write at a time; a failed write is only logged.
    let writes: Promise<void> = Promise.resolve();
    const report = (p: JobProgress) => {
      writes = writes.then(() => runs.progress(run.id, p.progress, encodeStep(p))).catch((error: unknown) => {
        console.error("[jobs] progress not saved", error instanceof Error ? error.name : typeof error);
      });
    };
    let finish: RunFinish;
    try {
      finish = await handler({ run, signal: abort.signal, report });
    } catch (error: unknown) {
      console.error(`[jobs] ${run.kind} failed`, error instanceof Error ? error.name : typeof error);
      finish = { status: "failed", error: "job_failed" };
    }
    await writes;
    // Stopped on request: it says so, and keeps what it found until then (a partial report).
    if (abort.signal.aborted) finish = { ...finish, status: "cancelled" };
    running = null;
    await runs.finish(run.id, finish);
  }

  async function drain(): Promise<void> {
    do {
      again = false;
      try {
        const runs = await deps.runs();
        for (let run = await runs.claimNext(); run; run = await runs.claimNext()) await runOne(runs, run);
      } catch (error: unknown) {
        // The database may be closed (a restore) or damaged: the next kick tries again.
        console.error("[jobs] queue unavailable", error instanceof Error ? error.name : typeof error);
      }
    } while (again);
  }

  return {
    kick() {
      if (loop) {
        again = true;
        return;
      }
      loop = drain().finally(() => {
        loop = null;
      });
    },
    async cancel(id) {
      if (running?.id === id) {
        running.abort.abort();
        return true;
      }
      return (await deps.runs()).cancelPending(id);
    },
    current: () => running?.id ?? null,
    idle: async () => {
      while (loop) await loop;
    },
  };
}
