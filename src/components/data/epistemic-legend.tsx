"use client";

import { useLocale } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { KindMarker, type MarkerKind } from "./kind-marker";
import { advancedMessages } from "./labels";

const ORDER: readonly MarkerKind[] = ["observed", "derived", "estimate", "assumption", "insufficient", "mock"];

export function EpistemicLegend({ className, compact = false }: { className?: string; compact?: boolean }) {
  const m = advancedMessages(useLocale()).data;
  return (
    <dl className={cn("grid text-xs", compact ? "gap-2.5" : "gap-4", className)}>
      {ORDER.map((kind) => (
        <div
          key={kind}
          className={cn(
            "grid-cols-[0.75rem_1fr] items-start gap-x-2",
            // Mock values exist only in analyses stored before V1: the entry shows only beside their banner.
            kind === "mock" ? "hidden [html:has([data-legacy-mock])_&]:grid" : "grid",
          )}
        >
          <dt className="pt-1">
            <KindMarker kind={kind} />
          </dt>
          <dd>
            <span className="text-foreground">{m.kinds[kind]}</span>
            {!compact && <span className="block text-muted-foreground">{m.kindHints[kind]}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
