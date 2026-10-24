import { createCn } from "cn/config";

/**
 * Class joining and Tailwind conflict resolution, taught the design system's own scale names:
 * a `rounded-panel` passed to a primitive replaces its default `rounded-pill` instead of stacking
 * on it, and `ease-spring` replaces `ease-out`.
 */
export const cn = createCn({
  extend: {
    theme: {
      radius: ["pill", "panel", "tile", "menu"],
      ease: ["spring"],
    },
  },
});
