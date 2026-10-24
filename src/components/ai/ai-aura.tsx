import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import "./ai-aura.css";

/** thinking: the AI is writing; ready: AI text is shown; off: no AI text (unavailable, rejected, error). */
export type AiAuraState = "thinking" | "ready" | "off";

interface AiAuraProps extends ComponentProps<"div"> {
  readonly state: AiAuraState;
  /** Classes for the inner graphite surface (padding, layout). */
  readonly surfaceClassName?: string;
}

/**
 * The single visual signature of anything the local AI wrote: a graphite tile with a 1px iridescent
 * halo and a faint glow. Only AI text goes inside; observed data never does.
 */
export function AiAura({ state, className, surfaceClassName, children, ...props }: AiAuraProps) {
  return (
    <div data-state={state} className={cn("ai-aura", className)} {...props}>
      <div className={cn("ai-aura-surface", surfaceClassName)}>{children}</div>
    </div>
  );
}

/** Applies the aura's soft fade and rise to AI content as it arrives; `--stagger` sets the order. */
export const aiRevealClassName = "ai-reveal";
