import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import type { CountryAnalysis } from "@/domain/analysis";
import { COUNTRIES } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { verdictFor } from "@/engine/report/verdict";
import { VerdictChip } from "./verdict-chip";
import { sortByScore } from "./country-ranking";

function Tile({ label, children, note, stagger }: { label: string; children: ReactNode; note?: ReactNode; stagger: number }) {
  return (
    <div className="animate-enter min-w-0 px-5 py-5 sm:px-[26px] sm:py-6" style={{ "--stagger": stagger } as React.CSSProperties}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">{children}</dd>
      {note && <dd className="mt-1.5 text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

/**
 * The analysis in four figures, all derived from the stored result (nothing estimated here):
 * countries compared, best opportunity, average confidence of scored countries, missing sources.
 */
export function AnalysisSummary({ countries }: { countries: readonly CountryAnalysis[] }) {
  const scored = countries.filter((c) => isKnown(c.scoring.score));
  const [best] = sortByScore(scored);
  const avgConfidence = scored.length > 0 ? scored.reduce((s, c) => s + c.scoring.confidence.score, 0) / scored.length : null;
  const gaps = new Set(countries.flatMap((c) => c.dataGaps));

  return (
    <dl className="panel grid grid-cols-2 overflow-hidden lg:grid-cols-4 [&>div]:border-line max-lg:[&>div:nth-child(-n+2)]:border-b max-lg:[&>div:nth-child(odd)]:border-r lg:divide-x lg:divide-line">
      <Tile label="Pays comparés" stagger={1} note={`${scored.length} avec un score`}>
        <AnimatedNumber value={countries.length} format="int" />
      </Tile>
      <Tile
        label="Meilleure opportunité"
        stagger={2}
        note={best ? <VerdictChip verdict={verdictFor(best)} /> : "Aucun pays n'a de score"}
      >
        {best && isKnown(best.scoring.score) ? (
          <span className="flex items-baseline gap-2">
            <span className="truncate">{COUNTRIES[best.country].nameFr}</span>
            <span className="text-base font-medium text-muted-foreground">
              <AnimatedNumber value={Math.round(best.scoring.score.value.total)} format="int" />
              /100
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Tile>
      <Tile label="Confiance moyenne" stagger={3} note="Moyenne des pays notés">
        {avgConfidence === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span>
            <AnimatedNumber value={Math.round(avgConfidence)} format="int" />
            <span className="text-base text-muted-foreground">&nbsp;%</span>
          </span>
        )}
      </Tile>
      <Tile label="Données manquantes" stagger={4} note={gaps.size === 0 ? "Toutes les sources ont répondu" : "Détail dans les limites ci-dessous"}>
        <AnimatedNumber value={gaps.size} format="int" />
      </Tile>
    </dl>
  );
}
