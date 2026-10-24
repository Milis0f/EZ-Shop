"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";
import { clampPercent, cssVars } from "./motion-utils";
import { useDeferUntilVisible } from "./use-defer-until-visible";

interface ProgressRingProps {
  /** Percentage in [0, 100]; out-of-range values are clamped, non-numbers draw nothing. */
  readonly value: number;
  /** What the ring means, value included (e.g. « Confiance 9 % »): the ring is one image to assistive tech. */
  readonly "aria-label": string;
  /** Outer size in px (default 120). */
  readonly size?: number;
  /** Stroke width in px (default 8). */
  readonly thickness?: number;
  /** Arc colour, any CSS colour (default craie). Hue is for the verdict only. */
  readonly color?: string;
  /** A soft halo of the arc colour, from a blurred copy of the arc. */
  readonly glow?: boolean;
  /** Wait before drawing, in ms, to sit inside an orchestrated sequence. */
  readonly delay?: number;
  /** Centred content, e.g. the verdict word. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Circular gauge: an ardoise track and an arc with round caps that draws from 0 to the value once,
 * when first seen (on load if on screen, otherwise when scrolled to). Later value changes ease to
 * the new value. Under reduced motion the arc is simply there.
 */
export function ProgressRing({
  value,
  "aria-label": ariaLabel,
  size = 120,
  thickness = 8,
  color,
  glow = false,
  delay = 0,
  children,
  className,
}: ProgressRingProps) {
  const deferRef = useDeferUntilVisible<HTMLDivElement>();
  const filterId = `ring-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const percent = clampPercent(value);
  const center = size / 2;
  const radius = Math.max(0, (size - thickness) / 2);
  const circle = { cx: center, cy: center, r: radius, strokeWidth: thickness, pathLength: 100 };

  return (
    <div
      ref={deferRef}
      role="img"
      aria-label={ariaLabel}
      data-empty={percent === 0 || undefined}
      className={cn(mk.progressRing, className)}
      style={cssVars({
        "--ring-size": `${size}px`,
        "--ring-offset": 100 - percent,
        "--ring-delay": `${delay}ms`,
        ...(color ? { "--ring-color": color } : {}),
      })}
    >
      <svg className={mk.progressRingSvg} viewBox={`0 0 ${size} ${size}`} focusable="false" aria-hidden="true">
        {glow ? (
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={thickness} />
            </filter>
          </defs>
        ) : null}
        <circle className={mk.progressRingTrack} {...circle} />
        {glow ? <circle className={cn(mk.progressRingArc, mk.progressRingGlow)} filter={`url(#${filterId})`} {...circle} /> : null}
        <circle className={mk.progressRingArc} {...circle} />
      </svg>
      {children ? <div className={mk.progressRingCenter}>{children}</div> : null}
    </div>
  );
}
