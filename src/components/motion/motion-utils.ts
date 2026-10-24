import type { CSSProperties } from "react";

/** A gauge value as a percentage in [0, 100]; anything that is not a finite number draws nothing. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

const FORWARD = new Set(["ArrowRight", "ArrowDown"]);
const BACKWARD = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Radio group keyboard model (WAI-ARIA APG): arrows move and wrap, Home and End jump.
 * `current` is -1 when nothing is checked yet. Returns null for keys the group does not handle.
 * In right-to-left text, left and right swap; up and down never do.
 */
export function nextRadioIndex(current: number, key: string, count: number, rtl = false): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  let forward: boolean;
  if (FORWARD.has(key)) forward = true;
  else if (BACKWARD.has(key)) forward = false;
  else return null;
  if (rtl && horizontal) forward = !forward;
  if (current < 0 || current >= count) return forward ? 0 : count - 1;
  return forward ? (current + 1) % count : (current - 1 + count) % count;
}

export interface BoxRect {
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** True when a laid-out box overlaps the viewport vertically (a box with no size is never on screen). */
export function isInViewport(rect: BoxRect, viewportHeight: number): boolean {
  if (rect.width === 0 && rect.height === 0) return false;
  return rect.bottom > 0 && rect.top < viewportHeight;
}

/** Inline CSS custom properties, typed: React's CSSProperties has no index signature for them. */
export function cssVars(vars: Readonly<Record<`--${string}`, string | number>>): CSSProperties {
  return vars as CSSProperties;
}
