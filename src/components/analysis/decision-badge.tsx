import type { Decision } from "@/domain/scoring";
import { DECISION_HINTS, DECISION_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<Decision, string> = {
  prioritize: "bg-decision-prioritize/12 text-decision-prioritize",
  test_carefully: "bg-decision-test/12 text-decision-test",
  avoid: "bg-decision-avoid/10 text-decision-avoid",
  exploratory_only: "bg-decision-explore/12 text-decision-explore",
  insufficient_data: "hatch bg-surface-2 text-muted-foreground",
};

/** Decision as a tinted pill: the colour carries the verdict, the dot keeps it readable in grayscale. */
export function DecisionBadge({ decision, withHint = false }: { decision: Decision; withHint?: boolean }) {
  return (
    <span className="inline-flex flex-col">
      <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", TONE[decision])}>
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        {DECISION_LABELS[decision]}
      </span>
      {withHint && <span className="mt-1.5 text-xs text-muted-foreground">{DECISION_HINTS[decision]}</span>}
    </span>
  );
}
