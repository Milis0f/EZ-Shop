import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";

interface RingLoaderProps {
  readonly size?: "sm" | "md";
  /** Spoken text when the loader stands alone; leave empty when a visible label already says it. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Small ring spinner in the current text colour, with round caps: a faint full track and an arc that
 * turns and breathes. Under reduced motion it holds still as a static arc.
 */
export function RingLoader({ size = "sm", label, className }: RingLoaderProps) {
  return (
    <span
      className={cn(mk.ring, size === "md" ? mk.ringMd : mk.ringSm, className)}
      role={label ? "status" : undefined}
      aria-hidden={label ? undefined : true}
    >
      <svg className={mk.ringSvg} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <circle className={mk.ringTrack} cx="12" cy="12" r="9" pathLength={100} />
        <circle className={mk.ringArc} cx="12" cy="12" r="9" pathLength={100} />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
