import "server-only";
import { deepResearchRequestSchema, type DeepEvent, type DeepReport } from "@/domain/deep-research";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { runDeepResearch, type DeepDeps } from "../research/deep-research";
import type { JobHandler } from "./worker";

/**
 * The deep AI research as a background job: the same research as before, its steps saved as progress,
 * its report kept with the run. The parameters are checked again: they were stored, not trusted.
 */
export function deepResearchJob(overrides: Partial<DeepDeps> = {}): JobHandler {
  return async ({ run, signal, report: save }) => {
    const request = deepResearchRequestSchema.safeParse(run.params);
    if (!request.success) return { status: "failed", error: "invalid_params" };
    const locale = isLocale(run.locale) ? run.locale : DEFAULT_LOCALE;

    let done: DeepReport | null = null;
    let failure: Extract<DeepEvent, { type: "failed" }>["code"] | null = null;
    await runDeepResearch(
      request.data,
      locale,
      (event) => {
        if (event.type === "step") save({ progress: event.progress, step: event.step, detail: event.detail });
        else if (event.type === "report") done = event.report;
        else if (event.type === "failed") failure = event.code;
      },
      overrides,
      signal,
    );
    // Assigned in the callback: TypeScript cannot see it, hence the cast.
    const finished = done as DeepReport | null;
    if (finished) return { status: "completed", result: finished, sourceCount: finished.sources.length, model: finished.model, durationMs: finished.durationMs };
    return { status: "failed", error: failure ?? "no_report" };
  };
}
