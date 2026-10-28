"use client";

import { Reveal } from "@/components/motion/reveal";
import { reasonText } from "@/engine/report/localize";
import type { Verdict } from "@/engine/report/verdict";
import { useLocale, useMessages } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { VERDICT_COLOR } from "./verdict-orb";

interface Reason {
  /** Engine code of the reason (stable across locales). */
  readonly code: string;
  readonly text: string;
  /** Explains the verdict itself (blocking factor or decision reason): shown in the verdict colour. */
  readonly decisive: boolean;
}

/** Blocking factors first (they decide a NON), else the decision reason, then the supporting signals. */
export function verdictReasons(verdict: Verdict, locale: Locale): Reason[] {
  const decisive = verdict.blocking.length > 0 ? verdict.blocking.map((b) => b.cause) : [verdict.cause];
  const toReason = (isDecisive: boolean) => (cause: Verdict["cause"]): Reason => ({ code: cause.code, text: reasonText(cause, locale), decisive: isDecisive });
  const first = decisive.map(toReason(true));
  const seen = new Set(first.map((r) => r.text));
  return [...first, ...verdict.signals.map(toReason(false)).filter((r) => !seen.has(r.text))];
}

interface ReasonPillsProps {
  readonly verdict: Verdict;
  /** Place of the first pill in the surrounding RevealGroup, so the pills follow the orb. */
  readonly startIndex: number;
  readonly className?: string;
}

/** The reasons of the verdict as pills, appearing one after the other inside the verdict reveal. */
export function ReasonPills({ verdict, startIndex, className }: ReasonPillsProps) {
  const locale = useLocale();
  const m = useMessages("report").pills;
  const reasons = verdictReasons(verdict, locale);
  if (reasons.length === 0) return null;
  const color = VERDICT_COLOR[verdict.value];
  return (
    <ul aria-label={m.aria} className={cn("mx-auto flex max-w-3xl flex-wrap justify-center gap-2.5", className)}>
      {reasons.map((reason, i) => (
        <Reveal
          as="li"
          key={reason.text}
          index={startIndex + i}
          className="rounded-pill border border-line bg-surface px-[18px] py-2.5 text-center text-[15px] leading-snug text-balance"
          style={reason.decisive ? { color, borderColor: `color-mix(in oklab, ${color} 35%, transparent)` } : undefined}
        >
          {reason.text}
        </Reveal>
      ))}
    </ul>
  );
}
