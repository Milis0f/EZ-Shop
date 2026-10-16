import { ChevronRight, FileSearch } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { ConfidenceMeter, ScoreMeter } from "@/components/analysis/meters";
import { CountryTag } from "@/components/data/country-tag";
import { COUNTRIES } from "@/domain/country";
import { formatDate } from "@/lib/format";
import { listRecentAnalyses } from "@/server/services";

export async function RecentAnalyses() {
  await connection();
  const analyses = await listRecentAnalyses(12);

  if (analyses.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
        <FileSearch className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm">Aucune analyse pour l&apos;instant.</p>
        <a href="#productName" className="text-xs font-medium underline underline-offset-4">
          Saisir un premier produit
        </a>
      </div>
    );
  }

  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {analyses.map((a) => (
        <li key={a.id}>
          <Link
            href={`/analyses/${a.id}`}
            className="group grid grid-cols-[1fr_auto] items-center gap-6 px-5 py-4 transition-colors duration-[var(--dur-fast)] hover:bg-surface-2/60 sm:grid-cols-[1fr_11rem_8rem_7rem_1rem]"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{a.productName}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {formatDate(a.createdAt)}, {a.countryCount} pays
                {a.dataMode === "mock" && <span className="ml-2 text-kind-mock">mock</span>}
                {a.status === "failed" && <span className="ml-2 text-decision-avoid">échec</span>}
              </span>
            </span>
            <span className="hidden min-w-0 items-center text-sm sm:flex">
              {a.topCountry ? (
                <>
                  <CountryTag code={a.topCountry.code} />
                  <span className="truncate">{COUNTRIES[a.topCountry.code].nameFr}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Aucun pays noté</span>
              )}
            </span>
            {a.topCountry ? (
              <>
                <ScoreMeter value={a.topCountry.score} className="hidden sm:flex" />
                <ConfidenceMeter value={a.topCountry.confidence} className="hidden sm:flex" />
              </>
            ) : (
              <span className="hidden text-sm text-muted-foreground sm:col-span-2 sm:block">pas de score</span>
            )}
            <ChevronRight
              aria-hidden
              className="size-4 text-muted-foreground transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
