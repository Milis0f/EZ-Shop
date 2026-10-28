"use client";

import { useLayoutEffect, useRef } from "react";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { formatCompact, formatDecimal, formatInt, formatMoney, formatPct } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { motionDuration, motionEasing } from "./motion-tokens";
import { prefersReducedMotion } from "./use-reduced-motion";

export type NumberFormat = "int" | "decimal" | "compact" | "percent" | "percentSigned" | "money";

interface AnimatedNumberProps {
  readonly value: number;
  readonly format: NumberFormat;
  readonly currency?: string;
  /** Total duration in ms. Default: twice the slow motion token (--dur-slow). */
  readonly duration?: number;
  readonly className?: string;
}

/** Digits and separators follow the active locale (same output as before in French). */
function formatter(format: NumberFormat, currency: string, locale: Locale): (v: number) => string {
  switch (format) {
    case "int":
      return (v) => formatInt(Math.round(v), locale);
    case "decimal":
      return (v) => formatDecimal(v, locale);
    case "compact":
      return (v) => formatCompact(v, locale);
    case "percent":
      return (v) => formatPct(v, locale);
    case "percentSigned":
      return (v) => formatPct(v, locale, { signed: true });
    case "money":
      return (v) => formatMoney(v, locale, currency);
  }
}

/**
 * Counts up to a real value once, when it first enters the viewport.
 * - Server and no-script render show the final value, so hydration always matches.
 * - Screen readers always get the final value (the moving digits are aria-hidden).
 * - prefers-reduced-motion: no count, final value immediately.
 * Text is written straight to the DOM node each frame: no React re-render per frame.
 * Tabular figures keep every digit the same width while it counts, and the final width is
 * reserved meanwhile, so neighbours never shift. Duration and easing come from the motion tokens.
 */
export function AnimatedNumber({ value, format, currency = "EUR", duration, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const locale = useLocale();
  const final = formatter(format, currency, locale)(value);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // A previous run's cleanup may have written the previous value: the current one always wins.
    if (node.textContent !== final) node.textContent = final;
    if (prefersReducedMotion() || !Number.isFinite(value) || value === 0) return;

    const display = formatter(format, currency, locale);
    const total = duration ?? motionDuration("slow") * 2;
    const ease = motionEasing("out");
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
        const t = total > 0 ? Math.min(1, (now - start) / total) : 1;
        if (t >= 1) release();
        else {
          node.textContent = display(value * ease(t));
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
  }, [value, format, currency, locale, duration, final]);

  return (
    <span className={cn("tabular-nums", className)}>
      <span ref={ref} aria-hidden>
        {final}
      </span>
      <span className="sr-only">{final}</span>
    </span>
  );
}
