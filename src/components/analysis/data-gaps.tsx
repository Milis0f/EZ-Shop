import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { CountryAnalysis } from "@/domain/analysis";
import { missingLabel } from "@/lib/format";

/** What would make this analysis more reliable, ranked by how many countries it affects. */
export function DataGaps({ countries }: { countries: readonly CountryAnalysis[] }) {
  const counts = new Map<string, number>();
  for (const c of countries) for (const gap of c.dataGaps) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  const gaps = [...counts.entries()].toSorted((a, b) => b[1] - a[1]);

  if (gaps.length === 0) {
    return (
      <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-kind-observed" aria-hidden />
        Toutes les sources attendues ont répondu pour les pays analysés.
      </p>
    );
  }

  return (
    <div className="text-sm">
      <p className="text-muted-foreground">Pour fiabiliser l&apos;analyse, il manque :</p>
      <ul className="mt-4 flex flex-col gap-1.5">
        {gaps.map(([gap, n]) => (
          <li key={gap} className="flex items-center justify-between gap-3 rounded-tile bg-surface-2/50 py-2.5 pr-2.5 pl-4">
            <span>{missingLabel(gap)}</span>
            <span className="shrink-0 rounded-pill border border-line px-2.5 py-0.5 text-xs text-muted-foreground">
              {n === countries.length ? "tous les pays" : `${n} pays`}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/connectors"
        className="mt-5 inline-flex items-center rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-primary/85 active:scale-[0.97]"
      >
        Brancher les sources
      </Link>
    </div>
  );
}
