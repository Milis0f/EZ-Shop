"use client";

import { useLayoutEffect, useRef } from "react";
import { formatCompact, formatDecimal, formatInt, formatMoney, formatPct } from "@/lib/format";
import { prefersReducedMotion } from "./use-reduced-motion";

export type NumberFormat = "int" | "decimal" | "compact" | "percent" | "percentSigned" | "money";

interface AnimatedNumberProps {
  readonly value: number;
  readonly format: NumberFormat;
  readonly currency?: string;
  /** Total duration in ms. */
  readonly duration?: number;
  readonly className?: string;
}

function formatter(format: NumberFormat, currency: string): (v: number) => string {
  switch (format) {
    case "int":
      return (v) => formatInt(Math.round(v));
    case "decimal":
      return formatDecimal;
    case "compact":
      return formatCompact;
    case "percent":
      return (v) => formatPct(v);
    case "percentSigned":
      return (v) => formatPct(v, true);
    case "money":
      return (v) => formatMoney(v, currency);
  }
}

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts up to a real value once, when it first enters the viewport.
 * - Server and no-script render show the final value.
 * - Screen readers always get the final value (the moving digits are aria-hidden).
 * - prefers-reduced-motion: no count, final value immediately.
 * Text is written straight to the DOM node each frame: no React re-render per frame.
 * The final width is reserved while counting, so neighbours never shift; digits stay proportional
 * (tabular figures in this typeface would also space out commas, "%" and "€").
 */
export function AnimatedNumber({ value, format, currency = "EUR", duration = 900, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = formatter(format, currency)(value);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || !Number.isFinite(value) || value === 0) return;

    const display = formatter(format, currency);
    let frame = 0;
    let primed = false;
    const release = () => {
      node.textContent = final;
      node.style.removeProperty("display");
      node.style.removeProperty("min-width");
    };
    const toZero = () => {
      if (primed) return;
      primed = true;
      node.style.display = "inline-block";
      node.style.minWidth = `${node.getBoundingClientRect().width}px`;
      node.textContent = display(0);
    };
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        if (t >= 1) release();
        else {
          node.textContent = display(value * easeOutExpo(t));
          frame = requestAnimationFrame(tick);
        }
      };
      frame = requestAnimationFrame(tick);
    };

    // Already on screen at hydration: reset now rather than one frame later.
    const rect = node.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) toZero();

    // Two stages, so an off-screen number keeps its real value until it is about to be seen:
    // "prime" resets it to zero just before it scrolls in, "start" counts once it is visible.
    const prime = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          prime.disconnect();
          toZero();
        }
      },
      { rootMargin: "0px 0px 160px 0px" },
    );
    const start = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start.disconnect();
          toZero();
          run();
        }
      },
      { threshold: 0.2 },
    );
    const showFinal = () => {
      prime.disconnect();
      start.disconnect();
      cancelAnimationFrame(frame);
      release();
    };
    prime.observe(node);
    start.observe(node);
    window.addEventListener("beforeprint", showFinal);
    return () => {
      window.removeEventListener("beforeprint", showFinal);
      showFinal();
    };
  }, [value, format, currency, duration, final]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden>
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
