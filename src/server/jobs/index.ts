import "server-only";
import type { DeepResearchRequest } from "@/domain/deep-research";
import type { Locale } from "@/i18n/config";
import { startRun, sweepInterrupted } from "../history";
import { getRepositories } from "../repositories";
import { deepResearchJob } from "./deep-job";
import { createWorker, type Worker } from "./worker";

/** One worker for the whole server process, kept across dev hot reloads. */
const globalForJobs = globalThis as unknown as { __ezShopWorker?: Worker };

export function jobWorker(): Worker {
  globalForJobs.__ezShopWorker ??= createWorker({
    runs: async () => {
      const { runs } = await getRepositories();
      // Runs cut by the last stop are marked first, so the worker never mistakes them for its own.
      await sweepInterrupted(runs);
      return runs;
    },
    handlers: { deep_research: deepResearchJob() },
  });
  return globalForJobs.__ezShopWorker;
}

/** Queues a deep AI research; the worker starts it as soon as it is free. Null if it could not be recorded. */
export async function enqueueDeepResearch(request: DeepResearchRequest, locale: Locale): Promise<string | null> {
  const id = await startRun({ kind: "deep_research", title: request.product, locale, countries: [request.country], params: request, status: "pending" });
  if (id) jobWorker().kick();
  return id;
}
