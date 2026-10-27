import { ProgressRing } from "@/components/motion/progress-ring";
import type { Verdict } from "@/engine/report/verdict";
import { VERDICT_COLOR } from "./verdict-orb";

const SIZE = 172;
const THICKNESS = 7;

/**
 * The verdict disc in compact size, for the country page: the same verdict word and confidence ring
 * as the report orb, without its orchestrated reveal (the ring simply draws once when shown).
 */
export function CompactOrb({ verdict, confidence }: { verdict: Verdict; confidence: number }) {
  const color = VERDICT_COLOR[verdict.value];
  const percent = Math.round(Math.min(100, Math.max(0, confidence)));
  return (
    <ProgressRing
      value={percent}
      size={SIZE}
      thickness={THICKNESS}
      color={color}
      glow
      aria-label={`Verdict ${verdict.label}, confiance ${percent} %`}
      className="shrink-0"
    >
      <div
        className="grid size-[142px] place-content-center gap-1 rounded-full text-center"
        style={{ background: `radial-gradient(circle at 50% 38%, color-mix(in oklab, ${color} 20%, var(--noir)) 0%, var(--noir) 72%)` }}
      >
        <span className="font-display text-[15px] leading-tight font-bold tracking-[-0.02em] whitespace-nowrap" style={{ color }}>
          {verdict.label}
        </span>
        <span className="tabular text-[12px] text-muted-foreground">Confiance {percent} %</span>
      </div>
    </ProgressRing>
  );
}
