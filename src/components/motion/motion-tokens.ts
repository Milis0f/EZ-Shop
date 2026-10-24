/**
 * Motion tokens for JavaScript-driven motion (count-ups, drawn paths).
 * The source of truth stays in globals.css (--dur-fast/base/slow, --ease-out, --ease-spring);
 * these helpers read it at run time so JS and CSS motion never drift apart.
 */

export type DurationToken = "fast" | "base" | "slow";
export type EasingToken = "out" | "spring";
export type BezierPoints = readonly [number, number, number, number];

/** Mirror of globals.css, used only where the stylesheet cannot be read (server render, tests). */
const FALLBACK_DURATIONS: Readonly<Record<DurationToken, number>> = { fast: 140, base: 240, slow: 480 };
const FALLBACK_EASINGS: Readonly<Record<EasingToken, BezierPoints>> = {
  out: [0.2, 0.8, 0.2, 1],
  spring: [0.34, 1.56, 0.64, 1],
};
const EASING_PROPERTIES: Readonly<Record<EasingToken, string>> = { out: "--ease-out", spring: "--ease-spring" };

const TIME = /^\s*(\d*\.?\d+)\s*(ms|s)\s*$/i;
const BEZIER = /^\s*cubic-bezier\(\s*([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)\s*$/i;

/** "480ms" or "0.48s" to milliseconds; null for anything else (empty, keywords, negative). */
export function parseCssTime(raw: string): number | null {
  const match = TIME.exec(raw);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2].toLowerCase() === "s" ? amount * 1000 : amount;
}

/** "cubic-bezier(0.2, 0.8, 0.2, 1)" to its four control values; null when malformed or x is outside [0, 1]. */
export function parseCubicBezier(raw: string): BezierPoints | null {
  const match = BEZIER.exec(raw);
  if (!match) return null;
  const [x1, y1, x2, y2] = match.slice(1, 5).map((part) => Number(part.trim()));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
  return [x1, y1, x2, y2];
}

/**
 * The timing function a CSS cubic-bezier() describes: progress in [0, 1] to eased progress.
 * Newton's method on x, with a bisection fallback where the curve is flat.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const EPSILON = 1e-6;

  const solve = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < EPSILON) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < EPSILON) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = x;
    for (let i = 0; i < 40 && high - low > EPSILON; i += 1) {
      if (sampleX(s) < x) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return s;
  };

  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solve(t)));
}

function readCustomProperty(name: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

/** A duration token in milliseconds, read from the stylesheet. */
export function motionDuration(token: DurationToken): number {
  return parseCssTime(readCustomProperty(`--dur-${token}`)) ?? FALLBACK_DURATIONS[token];
}

/** An easing token as a JS timing function, read from the stylesheet. */
export function motionEasing(token: EasingToken): (t: number) => number {
  const points = parseCubicBezier(readCustomProperty(EASING_PROPERTIES[token])) ?? FALLBACK_EASINGS[token];
  return cubicBezier(...points);
}
