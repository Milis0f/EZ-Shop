import type { DeepStringShape } from "./types";

/**
 * Placeholder: filled by the agent translating the server-side messages (API errors, server actions, validation).
 * Write English first in `en` (as const), then the same keys in `fr` and `es`.
 */
export const en = {} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {};

export const es: Shape = {};
