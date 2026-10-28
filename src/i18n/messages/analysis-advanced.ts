import type { DeepStringShape } from "./types";

/**
 * Placeholder: filled by the agent translating the advanced analysis page (ranking, market table, sourcing, assumptions).
 * Write English first in `en` (as const), then the same keys in `fr` and `es`.
 */
export const en = {} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {};

export const es: Shape = {};
