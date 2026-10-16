import { KIND_HINTS, KIND_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KindMarker, type MarkerKind } from "./kind-marker";

const ORDER: readonly MarkerKind[] = ["observed", "derived", "estimate", "assumption", "insufficient", "mock"];

export function EpistemicLegend({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <dl className={cn("grid text-xs", compact ? "gap-2.5" : "gap-4", className)}>
      {ORDER.map((kind) => (
        <div key={kind} className="grid grid-cols-[0.75rem_1fr] items-start gap-x-2">
          <dt className="pt-1">
            <KindMarker kind={kind} />
          </dt>
          <dd>
            <span className="text-foreground">{KIND_LABELS[kind]}</span>
            {!compact && <span className="block text-muted-foreground">{KIND_HINTS[kind]}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
