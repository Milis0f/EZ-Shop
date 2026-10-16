import { AnimatedNumber, type NumberFormat } from "@/components/motion/animated-number";
import type { Interval } from "@/domain/datum";
import { cn } from "@/lib/utils";

interface IntervalValueProps {
  readonly interval: Interval;
  readonly format: (v: number) => string;
  /** Counts the central value up on first view; must describe the same formatting as `format`. */
  readonly countUp?: { readonly format: NumberFormat; readonly currency?: string };
  readonly className?: string;
  readonly valueClassName?: string;
}

/** P50 first (the central scenario), P10–P90 range always visible next to it. */
export function IntervalValue({ interval, format, countUp, className, valueClassName }: IntervalValueProps) {
  return (
    <span className={cn("inline-flex flex-col leading-tight", className)}>
      {countUp ? (
        <AnimatedNumber value={interval.p50} format={countUp.format} currency={countUp.currency} className={valueClassName} />
      ) : (
        <span className={valueClassName}>{format(interval.p50)}</span>
      )}
      <span className="text-[11px] text-muted-foreground">
        {format(interval.p10)} à {format(interval.p90)}
      </span>
    </span>
  );
}

/** Horizontal whisker: P10–P90 band with the P50 tick, on a shared [0, max] scale. */
export function IntervalBar({ interval, max, className }: { interval: Interval; max: number; className?: string }) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / Math.max(max, 1e-9)) * 100))}%`;
  return (
    <span aria-hidden className={cn("relative block h-2 w-full rounded-full bg-surface-2", className)}>
      <span
        className="animate-bar absolute inset-y-0 rounded-full bg-kind-estimate/35"
        style={{ left: pct(interval.p10), width: `calc(${pct(interval.p90)} - ${pct(interval.p10)})` }}
      />
      <span className="absolute inset-y-[-2px] w-0.5 rounded bg-kind-estimate" style={{ left: pct(interval.p50) }} />
    </span>
  );
}
