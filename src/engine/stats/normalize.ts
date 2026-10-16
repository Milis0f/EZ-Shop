/** Normalizers map a raw value onto [0, 1]. Bounds come from config (modelling assumptions). */

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** min → 0, max → 1. */
export const linearScale = (value: number, min: number, max: number): number =>
  max === min ? 0 : clamp01((value - min) / (max - min));

/** best → 1, worst → 0 (works whether best is above or below worst). */
export const towards = (value: number, best: number, worst: number): number =>
  best === worst ? 0 : clamp01((value - worst) / (best - worst));

export const log10Scale = (value: number, minLog: number, maxLog: number): number =>
  value <= 0 ? 0 : linearScale(Math.log10(value), minLog, maxLog);

export const round = (value: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};
