import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DATA_INSUFFICIENT, isKnown, isMockTainted, type Datum, type Known } from "@/domain/datum";
import { KIND_LABELS, missingLabel, SOURCE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
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
              "hatch inline-flex items-center rounded-[3px] border border-kind-missing/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
              className,
            )}
          >
            {compact ? "insuffisant" : DATA_INSUFFICIENT}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium">{datum.reason}</p>
          {datum.missing.length > 0 && <p className="mt-1 opacity-80">Manque : {datum.missing.map(missingLabel).join(", ")}</p>}
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
        <DatumDetails datum={datum} mock={mock} />
      </TooltipContent>
    </Tooltip>
  );
}

function DatumDetails({ datum, mock }: { datum: Known<unknown>; mock: boolean }) {
  const periods = datum.sources.flatMap((s) => (s.period ? [`${s.period.start} → ${s.period.end}`] : []));
  const sources = [...new Set(datum.sources.map((s) => SOURCE_LABELS[s.sourceId] ?? s.sourceId))];
  return (
    <div className="space-y-1">
      <p className="font-medium">
        {KIND_LABELS[datum.kind]}
        {mock && " (mock : valeur fictive)"}
      </p>
      {sources.length > 0 && <p>Sources : {sources.join(", ")}</p>}
      {periods.length > 0 && <p>Période : {[...new Set(periods)].slice(0, 2).join(" ; ")}</p>}
      {datum.method && <p className="opacity-80">Méthode : {datum.method}</p>}
      {datum.assumptionKeys && datum.assumptionKeys.length > 0 && <p className="opacity-80">Hypothèses : {datum.assumptionKeys.join(", ")}</p>}
      {datum.note && <p className="opacity-80">{datum.note}</p>}
    </div>
  );
}
