import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ConfidenceMeter, ScoreMeter } from "@/components/analysis/meters";
import { CountryTag } from "@/components/data/country-tag";
import { COUNTRIES } from "@/domain/country";
import { formatDate } from "@/lib/format";
import { listRecentAnalyses } from "@/server/services";

/** The last analyses as round tiles: product, date, best country with its score and confidence. */
export async function RecentAnalyses() {
  await connection();
  const analyses = await listRecentAnalyses(12);

  if (analyses.length === 0) {
    return (
      <p className="rounded-tile border border-dashed border-foreground/15 px-6 py-10 text-center text-sm text-muted-foreground">
        Aucune analyse pour l&apos;instant. La première apparaîtra ici.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-3">
      {analyses.map((a) => (
        <li key={a.id} className="min-w-0">
          <Link
            href={`/analyses/${a.id}`}
            className="interactive group flex h-full flex-col gap-4 rounded-tile border border-line bg-surface p-5 hover:border-foreground/20 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.productName}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {formatDate(a.createdAt)}, {a.countryCount} pays
                  {a.dataMode === "mock" && <span className="ml-2">données fictives</span>}
                  {a.status === "failed" && <span className="ml-2 text-foreground">échec</span>}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                strokeWidth={1.5}
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </span>
            {a.topCountry ? (
              <span className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                <span className="flex min-w-0 items-center">
                  <CountryTag code={a.topCountry.code} />
                  <span className="truncate">{COUNTRIES[a.topCountry.code].nameFr}</span>
                </span>
                <span className="flex items-center gap-4">
                  <ScoreMeter value={a.topCountry.score} />
                  <ConfidenceMeter value={a.topCountry.confidence} />
                </span>
              </span>
            ) : (
              <span className="mt-auto text-sm text-muted-foreground">Aucun pays noté</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
