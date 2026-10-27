import type { FieldState } from "@/config/connector-fields";
import type { ProviderState } from "@/domain/analysis";
import { cn } from "@/lib/utils";

/**
 * What the sources page shows for one source. It refines the provider state with the fields
 * already typed: a source with some values set but still not ready is « à réparer ».
 * These are states, not verdicts: craie and brume, plus one ambre for what needs fixing.
 */
export type SourceStatus = "ready" | "repair" | "not_configured" | "not_implemented" | "mock";

export const SOURCE_STATUS_ORDER: readonly SourceStatus[] = ["ready", "repair", "not_configured", "not_implemented", "mock"];

export const SOURCE_STATUS_LABELS: Readonly<Record<SourceStatus, string>> = {
  ready: "Prête",
  repair: "À réparer",
  not_configured: "Non branchée",
  not_implemented: "À implémenter",
  mock: "Fictive",
};

const DOT_TONE: Readonly<Record<SourceStatus, string>> = {
  ready: "bg-foreground",
  repair: "bg-verdict-surveiller",
  not_configured: "bg-muted-foreground",
  not_implemented: "border border-muted-foreground/70 bg-transparent",
  mock: "hatch border border-muted-foreground/70",
};

export function sourceStatus(state: ProviderState, fields: readonly FieldState[]): SourceStatus {
  if (state === "not_configured" && fields.some((f) => f.set)) return "repair";
  return state;
}

interface StatusDotProps {
  readonly status: SourceStatus;
  readonly className?: string;
}

/** A round marker: filled for a source that works or can be branched, hollow for one not coded yet. */
export function StatusDot({ status, className }: StatusDotProps) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT_TONE[status], className)} />;
}

/** The status as a pill: dot plus label, same height as the other chips of a card. */
export function StatusChip({ status }: { readonly status: SourceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-[13px] font-medium whitespace-nowrap",
        status === "repair" ? "border-verdict-surveiller/35 text-verdict-surveiller" : "border-line bg-surface-2",
        status === "ready" ? "text-foreground" : status !== "repair" && "text-muted-foreground",
      )}
    >
      <StatusDot status={status} />
      {SOURCE_STATUS_LABELS[status]}
    </span>
  );
}
