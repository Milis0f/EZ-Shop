import "server-only";

/**
 * Minimal fixed-window rate limiter (per process). Enough for local / single-instance use.
 * TODO(rate-limit): switch to a shared store (Postgres or Redis) before multi-instance deployment.
 */

const windows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= limit) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  windows.set(key, { ...current, count: current.count + 1 });
  return { allowed: true, retryAfterSeconds: 0 };
}

export const ANALYSIS_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;
