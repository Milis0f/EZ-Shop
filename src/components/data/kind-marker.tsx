import { cn } from "@/lib/utils";
import type { ValueKind } from "@/domain/datum";

export type MarkerKind = ValueKind | "insufficient" | "mock";

const SHAPES: Record<MarkerKind, string> = {
  observed: "bg-kind-observed rounded-full",
  derived: "border-[1.5px] border-kind-derived rounded-full",
  estimate: "bg-kind-estimate rotate-45 rounded-[1px]",
  assumption: "border-[1.5px] border-dashed border-kind-assumption rounded-full",
  insufficient: "hatch border border-kind-missing rounded-[2px]",
  mock: "hatch-mock border border-kind-mock rounded-[2px]",
};

/**
 * Small glyph encoding the epistemic status of a value. Shape AND colour differ,
 * so the distinction survives colour-blindness and grayscale printing.
 */
export function KindMarker({ kind, className }: { kind: MarkerKind; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0", SHAPES[kind], className)} />;
}
