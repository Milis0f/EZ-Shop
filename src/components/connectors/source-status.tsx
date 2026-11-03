import type { FieldState } from "@/config/connector-fields";
import type { ProviderState } from "@/domain/analysis";
import { cn } from "@/lib/utils";

/**
 * What the pages show for one source. It refines the provider state with the fields already typed and
 * with the last real test on this computer: keys being present never make a source "ready".
 * - ready:    an open source that answers, or a keyed one whose last real test came back;
 * - untested: keys are there, but no real test has passed here yet;
 * - failing:  the last real test failed (an access level refused, a key revoked, a network error);
 * - repair:   some values are set, others missing.
 * These are states, not verdicts: craie and brume, plus ambre for what needs fixing.
 */
export type SourceStatus = "ready" | "untested" | "failing" | "repair" | "not_configured" | "not_implemented";

export const SOURCE_STATUS_ORDER: readonly SourceStatus[] = ["ready", "untested", "failing", "repair", "not_configured", "not_implemented"];

const DOT_TONE: Readonly<Record<SourceStatus, string>> = {
  ready: "bg-foreground",
  untested: "bg-foreground/35",
  failing: "bg-verdict-surveiller",
  repair: "bg-verdict-surveiller",
  not_configured: "bg-muted-foreground",
  not_implemented: "border border-muted-foreground/70 bg-transparent",
};

/** What the last real test of the source on this computer gave, if it ran. */
export type LastTest = "ok" | "empty" | "failed" | null;

export function sourceStatus(state: ProviderState, fields: readonly FieldState[], access: "open" | "account" | "approval" = "open", last: LastTest = null): SourceStatus {
  // The registry builds live providers only; a stored "mock" state means the real source is not branched.
  if (state === "mock") return "not_configured";
  if (state === "not_configured" && fields.some((f) => f.set)) return "repair";
  if (state !== "ready") return state;
  if (last === "failed") return "failing";
  // A key or a token proves nothing: a keyed source is ready once a real test answered (data or a valid empty answer).
  if (access !== "open" && last === null) return "untested";
  return "ready";
}

interface StatusDotProps {
  readonly status: SourceStatus;
  readonly className?: string;
}

/** A round marker: filled for a source that works or can be branched, hollow for one not coded yet. */
export function StatusDot({ status, className }: StatusDotProps) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT_TONE[status], className)} />;
}

/** The status as a pill: dot plus label (in the active language), same height as the other chips of a card. */
export function StatusChip({ status, label }: { readonly status: SourceStatus; readonly label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-[13px] font-medium whitespace-nowrap",
        status === "repair" || status === "failing" ? "border-verdict-surveiller/35 text-verdict-surveiller" : "border-line bg-surface-2",
        status === "ready" ? "text-foreground" : status !== "repair" && status !== "failing" && "text-muted-foreground",
      )}
    >
      <StatusDot status={status} />
      {label}
    </span>
  );
}
