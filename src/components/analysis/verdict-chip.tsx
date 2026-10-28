"use client";

import type { Verdict } from "@/engine/report/verdict";
import { verdictWord } from "@/engine/report/localize";
import { useLocale } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { VERDICT_COLOR } from "./verdict-orb";

/**
 * The verdict of one country as a pill: the dot and the word carry the verdict hue (the only hue of
 * the interface), the outline is a faint wash of it. Used in dense rows and tables.
 */
export function VerdictChip({ verdict, className }: { verdict: Verdict; className?: string }) {
  const locale = useLocale();
  const color = VERDICT_COLOR[verdict.value];
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-2 rounded-pill border px-3 py-1 text-xs font-semibold whitespace-nowrap", className)}
      style={{ color, borderColor: `color-mix(in oklab, ${color} 35%, transparent)`, backgroundColor: `color-mix(in oklab, ${color} 8%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {verdictWord(verdict.value, locale)}
    </span>
  );
}
