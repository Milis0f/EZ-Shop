/** Deterministic pseudo-random utilities: same seed → same simulation → reproducible estimates. */

export type Rng = () => number;

/** FNV-1a 32-bit hash of a string. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG — small, fast, good enough for Monte Carlo and fixtures. */
export function createRng(seed: number | string): Rng {
  let state = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const uniform = (rng: Rng, min: number, max: number): number => min + (max - min) * rng();

export const logUniform = (rng: Rng, min: number, max: number): number =>
  Math.exp(uniform(rng, Math.log(min), Math.log(max)));

/** Standard normal via Box–Muller. */
export function normal(rng: Rng): number {
  const u = Math.max(rng(), Number.EPSILON);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Inverse-CDF sampling of a triangular distribution. */
export function triangular(rng: Rng, min: number, mode: number, max: number): number {
  if (max <= min) return min;
  const u = rng();
  const cut = (mode - min) / (max - min);
  return u < cut
    ? min + Math.sqrt(u * (max - min) * (mode - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
