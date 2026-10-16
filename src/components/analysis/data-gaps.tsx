import { ArrowUpRight, CircleCheck } from "lucide-react";
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
      <ul className="mt-4 space-y-1">
        {gaps.map(([gap, n]) => (
          <li key={gap} className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 -mx-2">
            <span>{missingLabel(gap)}</span>
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
              {n === countries.length ? "tous les pays" : `${n} pays`}
            </span>
          </li>
        ))}
      </ul>
      <Link
        href="/connectors"
        className="interactive mt-5 inline-flex items-center gap-1 rounded-md text-xs font-medium underline-offset-4 hover:underline"
      >
        Brancher les sources
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
