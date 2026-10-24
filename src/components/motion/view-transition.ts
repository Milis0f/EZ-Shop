import { prefersReducedMotion } from "./use-reduced-motion";

/** The part of the browser's ViewTransition object this helper relies on. */
export interface ViewTransitionHandle {
  readonly updateCallbackDone: Promise<void>;
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
}

export interface ViewTransitionEnv {
  /** document.startViewTransition, when the browser has it. */
  readonly start?: (update: () => Promise<void>) => ViewTransitionHandle;
  readonly reducedMotion: boolean;
}

/** What the current browser offers. On the server there is nothing to animate. */
export function browserViewTransitionEnv(): ViewTransitionEnv {
  if (typeof document === "undefined") return { reducedMotion: true };
  const doc = document;
  return {
    start: typeof doc.startViewTransition === "function" ? (update) => doc.startViewTransition(update) : undefined,
    reducedMotion: prefersReducedMotion(),
  };
}

const ignore = (): void => undefined;

/**
 * Runs a DOM update inside a View Transition when the browser supports it and the visitor has not
 * asked for less motion; otherwise runs it right away, synchronously.
 *
 * The returned promise settles once the update has been applied (and rejects if the update throws).
 * With React state, flush inside the update so the DOM changes before the new snapshot is taken:
 *   viewTransition(() => flushSync(() => setMode("advanced")))
 */
export function viewTransition(
  update: () => void | Promise<void>,
  env: ViewTransitionEnv = browserViewTransitionEnv(),
): Promise<void> {
  const runDirectly = (): Promise<void> => {
    try {
      return Promise.resolve(update());
    } catch (error) {
      return Promise.reject(error);
    }
  };

  if (!env.start || env.reducedMotion) return runDirectly();

  let transition: ViewTransitionHandle;
  try {
    transition = env.start(async () => {
      await update();
    });
  } catch {
    return runDirectly();
  }
  // A skipped or interrupted transition rejects these two; the update's own outcome is the returned promise.
  transition.ready.catch(ignore);
  transition.finished.catch(ignore);
  return transition.updateCallbackDone;
}
