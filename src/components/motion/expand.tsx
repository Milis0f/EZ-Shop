import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { mk } from "./motion-classes";

interface ExpandProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly children: ReactNode;
  /** Classes for the clipping inner box (padding belongs here, not on the outer grid). */
  readonly innerClassName?: string;
}

/**
 * Controlled height animation for any content: grid rows 0fr to 1fr, plus a fade. No measuring.
 * Closed content stays in the DOM (searchable, printable) but is inert: no focus, no clicks,
 * hidden from assistive tech. The caller owns the trigger and its aria-expanded / aria-controls.
 */
export function Expand({ open, children, className, innerClassName, ...rest }: ExpandProps) {
  return (
    <div {...rest} data-open={open || undefined} inert={!open} className={cn(mk.expand, className)}>
      <div className={cn(mk.expandInner, innerClassName)}>{children}</div>
    </div>
  );
}
