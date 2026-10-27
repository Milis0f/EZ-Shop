import { KindMarker } from "@/components/data/kind-marker";
import { Disclosure } from "@/components/motion/disclosure";
import type { Assumption, Distribution } from "@/domain/assumption";
import { formatDecimal, formatRatioPct } from "@/lib/format";

function describe(d: Distribution, unit: Assumption["unit"]): string {
  const f = unit === "ratio" ? formatRatioPct : formatDecimal;
  return d.type === "fixed" ? f(d.value) : `${f(d.min)} à ${f(d.max)}`;
}

/** One row per assumption; opening it shows what it means and why this range was chosen. */
export function AssumptionsTable({ assumptions }: { assumptions: readonly Assumption[] }) {
  return (
    <div className="panel flex flex-col gap-1.5 p-2">
      {assumptions.map((a) => (
        <Disclosure
          key={a.key}
          className="rounded-tile bg-surface-2/40"
          summaryClassName="rounded-tile px-4 py-3.5 sm:px-[18px]"
          summary={
            <span className="grid items-center gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                <KindMarker kind="assumption" />
                {a.label}
                {a.origin === "user" && <span className="rounded-pill border border-line px-2.5 py-0.5 text-[11px] font-normal text-muted-foreground">saisi par toi</span>}
              </span>
              <span className="tabular pl-5 text-sm text-kind-assumption sm:pl-0 sm:whitespace-nowrap">
                {describe(a.distribution, a.unit)}
                {a.distribution.type === "triangular" && (
                  <span className="text-muted-foreground">, le plus probable {describe({ type: "fixed", value: a.distribution.mode }, a.unit)}</span>
                )}
              </span>
            </span>
          }
        >
          <div className="max-w-3xl space-y-1.5 pr-4 pb-4 pl-9 text-sm sm:pl-[2.6rem]">
            <p>{a.description}</p>
            <p className="text-muted-foreground">{a.rationale}</p>
          </div>
        </Disclosure>
      ))}
    </div>
  );
}
