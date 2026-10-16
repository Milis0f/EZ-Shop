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
    <div className="panel divide-y divide-line overflow-hidden">
      {assumptions.map((a) => (
        <Disclosure
          key={a.key}
          summaryClassName="rounded-none px-5 py-4"
          summary={
            <span className="grid items-center gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
              <span className="flex items-center gap-3 font-medium">
                <KindMarker kind="assumption" />
                {a.label}
                {a.origin === "user" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">saisie</span>}
              </span>
              <span className="pl-5 text-sm whitespace-nowrap text-kind-assumption sm:pl-0">
                {describe(a.distribution, a.unit)}
                {a.distribution.type === "triangular" && (
                  <span className="text-muted-foreground">, le plus probable {describe({ type: "fixed", value: a.distribution.mode }, a.unit)}</span>
                )}
              </span>
            </span>
          }
        >
          <div className="max-w-3xl space-y-1.5 pr-5 pb-5 pl-[2.75rem] text-sm">
            <p>{a.description}</p>
            <p className="text-muted-foreground">{a.rationale}</p>
          </div>
        </Disclosure>
      ))}
    </div>
  );
}
