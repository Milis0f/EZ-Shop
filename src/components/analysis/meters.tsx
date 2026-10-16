import { AnimatedNumber } from "@/components/motion/animated-number";
import { cn } from "@/lib/utils";

/**
 * Score and confidence never share an ink: score bars are full ink, confidence bars are muted,
 * so the two can never be read as one combined number. Bars fill once to their real value.
 */

type Size = "sm" | "lg";

const SIZES: Record<Size, { number: string; track: string }> = {
  sm: { number: "w-9 text-sm", track: "h-1.5 w-14" },
  lg: { number: "text-3xl", track: "h-2 w-14 sm:w-28" },
};

function Bar({ value, tone, size }: { value: number; tone: "ink" | "muted"; size: Size }) {
  return (
    <span aria-hidden className={cn("relative shrink-0 overflow-hidden rounded-full bg-surface-2", SIZES[size].track)}>
      <span
        className={cn("animate-bar absolute inset-y-0 left-0 rounded-full", tone === "ink" ? "bg-foreground" : "bg-muted-foreground/60")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </span>
  );
}

export function ScoreMeter({ value, className, size = "sm" }: { value: number; className?: string; size?: Size }) {
  return (
    <span className={cn("flex items-center gap-2.5 whitespace-nowrap", size === "lg" && "gap-4", className)}>
      <AnimatedNumber value={Math.round(value)} format="int" className={cn("text-right font-semibold", SIZES[size].number)} />
      <Bar value={value} tone="ink" size={size} />
    </span>
  );
}

export function ConfidenceMeter({ value, className, size = "sm" }: { value: number; className?: string; size?: Size }) {
  return (
    <span className={cn("flex items-center gap-2.5 whitespace-nowrap", size === "lg" && "gap-4", className)}>
      <span className={cn("text-right text-muted-foreground", SIZES[size].number)}>
        <AnimatedNumber value={Math.round(value)} format="int" />
        <span className={size === "lg" ? "ml-1 text-lg" : undefined}>&nbsp;%</span>
      </span>
      <Bar value={value} tone="muted" size={size} />
    </span>
  );
}
