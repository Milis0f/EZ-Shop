import { ok, type ProviderResult } from "./contracts";

export interface SharedResult<T> {
  /** The kept value, the load already in flight, or a new load: never two loads at once. */
  get(): Promise<ProviderResult<T>>;
  /** Forgets the kept value and the load in flight. A later `get()` loads again. */
  reset(): void;
}

export interface SharedResultOptions<T> {
  /** How long a success is kept, computed once from the value when it is stored. Without it, kept for the life of the instance. */
  readonly ttlMs?: (value: T) => number;
  /** Clock in milliseconds. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface Kept<T> {
  readonly value: T;
  readonly expiresAt: number;
}

/**
 * One shared load for concurrent callers. An analysis collects several countries in parallel against a
 * single provider instance: without it each country fetches its own OAuth token or account lookup.
 *
 * Only a success is kept. A failed result or a rejected promise is handed to every caller waiting on
 * that load, then forgotten, so the next `get()` tries again.
 *
 * `reset()` bumps a generation. A load started before it still answers its own waiters, but it stores
 * nothing and clears nothing afterwards: its result must not replace the value or the in-flight load
 * of a later `get()`.
 */
export function sharedResult<T>(load: () => Promise<ProviderResult<T>>, options: SharedResultOptions<T> = {}): SharedResult<T> {
  const now = options.now ?? Date.now;
  let generation = 0;
  let kept: Kept<T> | undefined;
  let inFlight: Promise<ProviderResult<T>> | undefined;

  return {
    get() {
      if (kept) {
        if (now() < kept.expiresAt) return Promise.resolve(ok(kept.value));
        kept = undefined;
      }
      if (inFlight) return inFlight;

      const startedIn = generation;
      // Only a load that is still the current one may store its result or free the slot.
      const isCurrent = () => startedIn === generation && inFlight === promise;
      // The callbacks below run after `promise` is assigned; wrapping `load` also turns a synchronous throw into a rejection.
      const promise: Promise<ProviderResult<T>> = new Promise<ProviderResult<T>>((resolve) => resolve(load()))
        .then((result) => {
          if (result.ok && isCurrent()) {
            const ttlMs = options.ttlMs?.(result.data);
            kept = { value: result.data, expiresAt: ttlMs === undefined ? Number.POSITIVE_INFINITY : now() + ttlMs };
          }
          return result;
        })
        .finally(() => {
          if (isCurrent()) inFlight = undefined;
        });
      inFlight = promise;
      return promise;
    },
    reset() {
      generation += 1;
      kept = undefined;
      inFlight = undefined;
    },
  };
}
