import { z } from "zod";
import type { AnalysisSummary } from "./analysis";

/**
 * One history for every kind of research: the product analyses keep their own tables (`analyses`),
 * the other research lands in `research_runs`, and the history page lists both together.
 * The statuses already cover long tasks run in the background (pending, running, interrupted).
 */

export const RUN_KINDS = ["deep_research", "competitor", "web_research"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_STATUSES = ["pending", "running", "completed", "failed", "cancelled", "interrupted"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Every kind the history page can filter on: the product analyses, then the runs. */
export const HISTORY_KINDS = ["analysis", ...RUN_KINDS] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export const historyQuerySchema = z.object({
  kind: z.enum(HISTORY_KINDS).optional().catch(undefined),
  q: z.string().trim().max(120).optional().catch(undefined),
  order: z.enum(["newest", "oldest"]).catch("newest").default("newest"),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** One line of the history, whatever produced it. */
export interface HistoryEntry {
  readonly id: string;
  readonly kind: HistoryKind;
  readonly title: string;
  readonly createdAt: string;
  readonly status: RunStatus;
  /** Countries researched (ISO codes), when the research is about markets. */
  readonly countries: readonly string[];
  readonly sourceCount: number | null;
  readonly href: string;
  /** A product analysis' verdict, as its report opens with it. */
  readonly verdict?: AnalysisSummary["verdict"];
}

/** The step a running run is at, as the worker saved it. */
export const runStepSchema = z.object({ step: z.string().max(40), detail: z.string().max(400).nullable() });
export type RunStep = z.infer<typeof runStepSchema>;

/** Reads the saved step; anything unreadable is no step rather than a wrong one. */
export function parseRunStep(text: string | null): RunStep | null {
  if (!text) return null;
  try {
    const parsed = runStepSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** What the page polls while a run works: GET /api/runs/:id. `result` comes once it is completed. */
export const runViewSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(RUN_KINDS),
  title: z.string(),
  status: z.enum(RUN_STATUSES),
  progress: z.number().min(0).max(1).nullable(),
  step: runStepSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  result: z.unknown().optional(),
});
export type RunView = z.infer<typeof runViewSchema>;

export const isRunOver = (status: RunStatus): boolean => status !== "pending" && status !== "running";
