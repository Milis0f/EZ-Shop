import { DECISION_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Thresholds {
  readonly prioritizeScore: number;
  readonly prioritizeConfidence: number;
  readonly testScore: number;
  readonly minConfidence: number;
}

/** A zone on the 0–100 × 0–100 plane, in percent of each axis. */
function Zone({ x0, x1, y0, y1, className, label }: { x0: number; x1: number; y0: number; y1: number; className: string; label: string }) {
  return (
    <div
      className={cn("absolute flex items-start p-2 text-[11px] font-medium", className)}
      style={{ left: `${x0}%`, width: `${x1 - x0}%`, bottom: `${y0}%`, height: `${y1 - y0}%` }}
    >
      {label}
    </div>
  );
}

/**
 * The decision rule of the engine drawn to scale: confidence on x, score on y.
 * Built from the same thresholds the engine uses, so the figure cannot drift from the code.
 */
export function DecisionZones({ t }: { t: Thresholds }) {
  return (
    <figure className="mt-2">
      <div className="grid grid-cols-[2rem_1fr] gap-2">
        <div className="relative text-[10px] text-muted-foreground tabular">
          {[100, t.prioritizeScore, t.testScore, 0].map((v) => (
            <span key={v} className="absolute right-0 translate-y-1/2" style={{ bottom: `${v}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="relative aspect-[16/9] overflow-hidden rounded-tile border border-line">
          <Zone x0={0} x1={t.minConfidence} y0={0} y1={100} className="hatch border-r border-line bg-decision-explore/10 text-decision-explore" label={DECISION_LABELS.exploratory_only} />
          <Zone x0={t.minConfidence} x1={100} y0={0} y1={t.testScore} className="border-t border-line bg-decision-avoid/10 text-decision-avoid" label={DECISION_LABELS.avoid} />
          {/* Label at the bottom of its zone, against the line it shares with "avoid", clear of "prioritize". */}
          <Zone x0={t.minConfidence} x1={100} y0={t.testScore} y1={100} className="items-end bg-decision-test/10 text-decision-test" label={DECISION_LABELS.test_carefully} />
          <Zone
            x0={t.prioritizeConfidence}
            x1={100}
            y0={t.prioritizeScore}
            y1={100}
            className="border-b border-l border-decision-prioritize/30 bg-decision-prioritize/12 text-decision-prioritize"
            label={DECISION_LABELS.prioritize}
          />
        </div>
        <span />
        <div className="relative h-4 text-[10px] text-muted-foreground tabular">
          {[0, t.minConfidence, t.prioritizeConfidence, 100].map((v) => (
            <span key={v} className={cn("absolute top-0", v === 100 ? "-translate-x-full" : v > 0 && "-translate-x-1/2")} style={{ left: `${v}%` }}>
              {v}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 pl-10 text-xs text-muted-foreground">
        Horizontal : confiance (%). Vertical : score d&apos;opportunité. Sans score calculable, la décision est « {DECISION_LABELS.insufficient_data} ».
      </figcaption>
    </figure>
  );
}
