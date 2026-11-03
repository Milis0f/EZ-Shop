import { isRunOver, runViewSchema, type RunView } from "@/domain/history";

/** How often the page asks where a run is. One small local request a second. */
const POLL_MS = 1000;
/** Failed polls in a row before giving up (the server stopped, the database is being restored). */
const MAX_MISSES = 30;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Follows a background run until it is over, calling `onView` at each poll. Resolves with the last
 * view, or null when stopped (the page left) or when the server stopped answering.
 */
export async function followRun(id: string, signal: AbortSignal, onView: (view: RunView) => void): Promise<RunView | null> {
  let misses = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(`/api/runs/${id}`, { cache: "no-store", signal });
      const parsed = runViewSchema.safeParse(((await response.json()) as { data?: unknown }).data);
      if (parsed.success) {
        misses = 0;
        onView(parsed.data);
        if (isRunOver(parsed.data.status)) return parsed.data;
      } else if (response.status === 404) {
        return null;
      } else {
        misses += 1;
      }
    } catch {
      if (signal.aborted) return null;
      misses += 1;
    }
    if (misses >= MAX_MISSES) return null;
    await pause(POLL_MS, signal);
  }
  return null;
}

/** Asks the server to stop a run. */
export async function cancelRun(id: string): Promise<void> {
  await fetch(`/api/runs/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => undefined);
}
