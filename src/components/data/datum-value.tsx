import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DATA_INSUFFICIENT, isKnown, isMockTainted, type Datum, type Known } from "@/domain/datum";
import { cn } from "@/lib/utils";
import { DatumDetails, InsufficientDetails, InsufficientShort } from "./datum-details";
import { KindMarker } from "./kind-marker";

interface DatumValueProps<T> {
  readonly datum: Datum<T>;
  readonly format: (value: T) => ReactNode;
  readonly className?: string;
  /** Short text for insufficient values in dense tables. */
  readonly compact?: boolean;
}

/**
 * Renders any Datum: the value with its epistemic marker, or an explicit
 * DATA_INSUFFICIENT chip. Details (method, sources, period, assumptions) on hover/focus.
 */
export function DatumValue<T>({ datum, format, className, compact = false }: DatumValueProps<T>) {
  if (!isKnown(datum)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "hatch inline-flex items-center rounded-pill border border-kind-missing/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
              className,
            )}
          >
            {compact ? <InsufficientShort /> : DATA_INSUFFICIENT}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <InsufficientDetails reason={datum.reason} missing={datum.missing} />
        </TooltipContent>
      </Tooltip>
    );
  }

  const mock = isMockTainted(datum);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex items-center gap-1.5", className)}>
          <KindMarker kind={mock ? "mock" : datum.kind} />
          <span>{format(datum.value)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <Details datum={datum} mock={mock} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Only the plain fields the tooltip shows cross to the client, never the value itself. */
function Details({ datum, mock }: { datum: Known<unknown>; mock: boolean }) {
  const periods = [...new Set(datum.sources.flatMap((s) => (s.period ? [`${s.period.start} → ${s.period.end}`] : [])))].slice(0, 2);
  return (
    <DatumDetails
      kind={datum.kind}
      mock={mock}
      sourceIds={datum.sources.map((s) => s.sourceId)}
      periods={periods}
      method={datum.method}
      assumptionKeys={datum.assumptionKeys}
      note={datum.note}
    />
  );
}
