import { Reveal } from "@/components/motion/reveal";
import type { Verdict } from "@/engine/report/verdict";
import { cn } from "@/lib/utils";
import { VERDICT_COLOR } from "./verdict-orb";

interface Reason {
  readonly text: string;
  /** Explains the verdict itself (blocking factor or decision reason): shown in the verdict colour. */
  readonly decisive: boolean;
}

/** Blocking factors first (they decide a NON), else the decision reason, then the supporting signals. */
export function verdictReasons(verdict: Verdict): Reason[] {
  const decisive = verdict.blocking.length > 0 ? verdict.blocking.map((b) => b.message) : [verdict.reason];
  const seen = new Set(decisive);
  return [
    ...decisive.map((text) => ({ text, decisive: true })),
    ...verdict.supporting.filter((text) => !seen.has(text)).map((text) => ({ text, decisive: false })),
  ];
}

interface ReasonPillsProps {
  readonly verdict: Verdict;
  /** Place of the first pill in the surrounding RevealGroup, so the pills follow the orb. */
  readonly startIndex: number;
  readonly className?: string;
}

/** The reasons of the verdict as pills, appearing one after the other inside the verdict reveal. */
export function ReasonPills({ verdict, startIndex, className }: ReasonPillsProps) {
  const reasons = verdictReasons(verdict);
  if (reasons.length === 0) return null;
  const color = VERDICT_COLOR[verdict.value];
  return (
    <ul aria-label="Raisons du verdict" className={cn("mx-auto flex max-w-3xl flex-wrap justify-center gap-2.5", className)}>
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
