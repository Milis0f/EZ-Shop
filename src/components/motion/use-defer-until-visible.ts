"use client";

import { useCallback, type RefCallback } from "react";
import { isInViewport } from "./motion-utils";
import { prefersReducedMotion } from "./use-reduced-motion";

const ATTRIBUTE = "data-motion";

/**
 * One-time CSS entrances (reveals, ring draws) start when the element is inserted, which is right
 * for whatever is on screen at load, server render included, with no script needed.
 * For an element mounted off screen, this ref holds that entrance (data-motion="defer", styled in
 * motion.css) and releases it once, when the element scrolls in: the animation then restarts
 * from its first frame. Content on screen at mount is never touched, so it never flashes.
 */
export function useDeferUntilVisible<T extends Element>(enabled = true): RefCallback<T> {
  return useCallback(
    (node: T | null) => {
      if (!node || !enabled || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
      if (isInViewport(node.getBoundingClientRect(), window.innerHeight)) return;

      node.setAttribute(ATTRIBUTE, "defer");
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          node.removeAttribute(ATTRIBUTE);
        },
        // Plays once the top edge is a little inside the viewport, also for elements taller than it.
        { rootMargin: "0px 0px -8% 0px" },
      );
      observer.observe(node);
      return () => {
        observer.disconnect();
        node.removeAttribute(ATTRIBUTE);
      };
    },
    [enabled],
  );
}
