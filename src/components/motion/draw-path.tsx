"use client";

import { useCallback, type RefCallback, type SVGProps } from "react";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";
import { prefersReducedMotion } from "./use-reduced-motion";

/**
 * Put this class on any element bound with useDrawPath: it hides the stroke from the first paint
 * until the script has measured it, so the full line never flashes before drawing.
 */
export const drawPathClassName: string = mk.drawPath;

function measure(node: SVGGeometryElement): number {
  try {
    return node.getTotalLength();
  } catch {
    // Some engines throw for an element that is not rendered (display: none).
    return 0;
  }
}

/**
 * Draws a solid stroke once, when it first becomes visible: stroke-dashoffset goes from the path's
 * getTotalLength() to 0 on twice the slow token. Afterwards the inline dash styles are removed, so
 * later data changes render as plain lines. Not for dashed strokes (it would override their dashes).
 *
 *   const drawRef = useDrawPath<SVGPathElement>();
 *   <path ref={drawRef} className={drawPathClassName} d={d} />
 */
export function useDrawPath<T extends SVGGeometryElement>(): RefCallback<T> {
  return useCallback((node: T | null) => {
    if (!node) return;
    const done = () => {
      node.style.removeProperty("stroke-dasharray");
      node.style.removeProperty("stroke-dashoffset");
      node.setAttribute("data-draw", "done");
    };
    const length = measure(node);
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined" || !(length > 0)) {
      done();
      return;
    }

    node.style.strokeDasharray = `${length} ${length}`;
    node.style.strokeDashoffset = `${length}`;
    node.setAttribute("data-draw", "ready");
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName === "stroke-dashoffset") done();
    };
    node.addEventListener("transitionend", onEnd);
    node.addEventListener("transitioncancel", onEnd);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // The hidden state is committed before the transition starts from it.
        node.getBoundingClientRect();
        node.setAttribute("data-draw", "drawing");
        node.style.strokeDashoffset = "0";
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      node.removeEventListener("transitionend", onEnd);
      node.removeEventListener("transitioncancel", onEnd);
      done();
    };
  }, []);
}

type DrawPathProps = Omit<SVGProps<SVGPathElement>, "ref">;

/** A <path> that draws itself once when visible. Give it a stroke and fill="none". */
export function DrawPath({ className, ...rest }: DrawPathProps) {
  const drawRef = useDrawPath<SVGPathElement>();
  return <path {...rest} ref={drawRef} className={cn(drawPathClassName, className)} />;
}
