"use client";

import { ProgressRing } from "@/components/motion/progress-ring";
import { verdictWord } from "@/engine/report/localize";
import type { Verdict, VerdictValue } from "@/engine/report/verdict";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";

/** The only hues of the interface: one per verdict. */
export const VERDICT_COLOR: Readonly<Record<VerdictValue, string>> = {
  oui: "var(--verdict-oui)",
  surveiller: "var(--verdict-surveiller)",
  non: "var(--verdict-non)",
};

const ORB_SIZE = 300;
const RING_THICKNESS = 10;
/** The ring starts drawing once the disc has begun to rise. */
const RING_DELAY_MS = 250;

interface VerdictOrbProps {
  readonly verdict: Verdict;
  /** Real confidence score, 0 to 100. */
  readonly confidence: number;
}

/**
 * The verdict disc: the verdict word in its colour, inside a ring drawn to the real confidence.
 * The glow is the verdict's own light (gradients and a blurred arc), never a shadow.
 */
export function VerdictOrb({ verdict, confidence }: VerdictOrbProps) {
  const color = VERDICT_COLOR[verdict.value];
  const percent = Math.round(Math.min(100, Math.max(0, confidence)));
  const m = useMessages("report").orb;
  const f = useFormat();
  const word = verdictWord(verdict.value, f.locale);
  const shown = f.pct(percent);
  return (
    <div className="relative grid place-items-center">
      <div
        aria-hidden
        className="pointer-events-none absolute size-[360px] rounded-full"
        style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 16%, transparent), transparent)` }}
      />
      <ProgressRing
        value={percent}
        size={ORB_SIZE}
        thickness={RING_THICKNESS}
        color={color}
        glow
        delay={RING_DELAY_MS}
        aria-label={t(m.aria, { verdict: word, confidence: shown })}
      >
        <div
          className="grid size-[236px] place-content-center gap-2 rounded-full text-center"
          style={{ background: `radial-gradient(circle at 50% 38%, color-mix(in oklab, ${color} 22%, var(--noir)) 0%, var(--noir) 72%)` }}
        >
          <span className="font-display text-[24px] leading-[1.15] font-bold tracking-[-0.02em] whitespace-nowrap" style={{ color }}>
            {word}
          </span>
          <span className="tabular text-[13px] text-muted-foreground">{t(m.confidence, { confidence: shown })}</span>
        </div>
      </ProgressRing>
    </div>
  );
}
