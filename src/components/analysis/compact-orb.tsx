"use client";

import { advancedMessages } from "@/components/data/labels";
import { ProgressRing } from "@/components/motion/progress-ring";
import { verdictWord } from "@/engine/report/localize";
import type { Verdict } from "@/engine/report/verdict";
import { useFormat } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { VERDICT_COLOR } from "./verdict-orb";

const SIZE = 172;
const THICKNESS = 7;

/**
 * The verdict disc in compact size, for the country page: the same verdict word and confidence ring
 * as the report orb, without its orchestrated reveal (the ring simply draws once when shown).
 */
export function CompactOrb({ verdict, confidence }: { verdict: Verdict; confidence: number }) {
  const f = useFormat();
  const m = advancedMessages(f.locale).orb;
  const color = VERDICT_COLOR[verdict.value];
  const percent = Math.round(Math.min(100, Math.max(0, confidence)));
  const word = verdictWord(verdict.value, f.locale);
  const shown = f.pct(percent);
  return (
    <ProgressRing
      value={percent}
      size={SIZE}
      thickness={THICKNESS}
      color={color}
      glow
      aria-label={t(m.aria, { verdict: word, confidence: shown })}
      className="shrink-0"
    >
      <div
        className="grid size-[142px] place-content-center gap-1 rounded-full text-center"
        style={{ background: `radial-gradient(circle at 50% 38%, color-mix(in oklab, ${color} 20%, var(--noir)) 0%, var(--noir) 72%)` }}
      >
        <span className="font-display text-[15px] leading-tight font-bold tracking-[-0.02em] whitespace-nowrap" style={{ color }}>
          {word}
        </span>
        <span className="tabular text-[12px] text-muted-foreground">{t(m.confidence, { confidence: shown })}</span>
      </div>
    </ProgressRing>
  );
}
