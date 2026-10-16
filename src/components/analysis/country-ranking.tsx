import Link from "next/link";
import { DatumValue } from "@/components/data/datum-value";
import { IntervalValue } from "@/components/data/interval-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { CountryTag } from "@/components/data/country-tag";
import { COUNTRIES } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { MONTH_LABELS_FR } from "@/domain/time";
import { COMPETITION_LABELS, formatCompact, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DecisionBadge } from "./decision-badge";
import { ConfidenceMeter, ScoreMeter } from "./meters";

export function sortByScore(countries: readonly CountryAnalysis[]): CountryAnalysis[] {
  const value = (c: CountryAnalysis) => (isKnown(c.scoring.score) ? c.scoring.score.value.total : -1);
  return countries.toSorted((a, b) => value(b) - value(a) || b.scoring.confidence.score - a.scoring.confidence.score);
}

interface CountryRankingProps {
  readonly analysisId: string;
  readonly countries: readonly CountryAnalysis[];
  readonly economics: UnitEconomics;
}

/** Pinned first column: opaque so scrolled cells pass under it, above the row overlay and tooltips. */
const STICKY = "sticky left-0 z-20 bg-surface shadow-[1px_0_0_var(--line)] transition-colors duration-[var(--dur-fast)]";

const capped = (c: CountryAnalysis) => isKnown(c.scoring.score) && c.scoring.score.value.cap !== undefined;

/**
 * Every country on one row; a capped score is marked once with a footnote instead of on every row.
 * The country column stays pinned while the table scrolls sideways. The whole row opens the country:
 * the name is the real link, a mouse-only overlay (last cell) covers the rest of the row, and value
 * tooltips sit above that overlay.
 */
export function CountryRanking({ analysisId, countries, economics }: CountryRankingProps) {
  const ranked = sortByScore(countries);
  const anyCapped = ranked.some(capped);

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[60rem] text-[13px] [&_td]:px-3 [&_td]:py-3.5 [&_th]:px-3 [&_[data-slot=tooltip-trigger]]:relative [&_[data-slot=tooltip-trigger]]:z-10">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(STICKY, "pl-5")}>Pays</TableHead>
              <TableHead>Décision</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Confiance</TableHead>
              <TableHead className="text-right">Recherches/mois</TableHead>
              <TableHead className="text-right">Tendance</TableHead>
              <TableHead>Pic</TableHead>
              <TableHead className="text-right">Ventes/an</TableHead>
              <TableHead className="text-right">CA HT/an</TableHead>
              <TableHead className="text-right">CPC Google</TableHead>
              <TableHead className="pr-5">Concurrence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((c, index) => {
              const google = c.advertising.find((a) => a.platform === "google");
              const href = `/analyses/${analysisId}/${c.country.toLowerCase()}`;
              return (
                <TableRow key={c.country} className="group relative border-line transition-colors duration-[var(--dur-fast)] hover:bg-surface-2">
                  <TableCell className={cn(STICKY, "pl-5 group-hover:bg-surface-2")}>
                    <Link href={href} className="flex items-center gap-2 font-medium underline-offset-4 group-hover:underline">
                      <CountryTag code={c.country} />
                      {COUNTRIES[c.country].nameFr}
                    </Link>
                    {c.languageMismatch && <span className="mt-0.5 block pl-8 text-[11px] text-muted-foreground">terme non traduit</span>}
                  </TableCell>
                  <TableCell>
                    <DecisionBadge decision={c.scoring.decision} />
                  </TableCell>
                  <TableCell>
                    {isKnown(c.scoring.score) ? (
                      <span className="flex items-center" style={{ "--stagger": index } as React.CSSProperties}>
                        <ScoreMeter value={c.scoring.score.value.total} />
                        {capped(c) && (
                          <span className="ml-1 text-muted-foreground" title={c.scoring.score.value.cap?.reason}>
                            *
                          </span>
                        )}
                      </span>
                    ) : (
                      <DatumValue datum={c.scoring.score} format={() => null} compact />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block" style={{ "--stagger": index } as React.CSSProperties}>
                      <ConfidenceMeter value={c.scoring.confidence.score} />
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={c.demand.avgMonthlySearches} format={formatCompact} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={c.demand.trend} format={(t) => formatPct(t.annualGrowthPct, true)} compact />
                  </TableCell>
                  <TableCell>
                    <DatumValue
                      datum={c.demand.seasonality}
                      format={(s) => (s.isSeasonal ? MONTH_LABELS_FR[(s.peakMonths[0] ?? 1) - 1] : "régulier")}
                      compact
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={c.sales.annualOrders} format={(i) => <IntervalValue interval={i} format={formatCompact} className="items-end" />} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue
                      datum={c.sales.annualRevenue}
                      format={(i) => <IntervalValue interval={i} format={(v) => formatMoney(v, economics.currency)} className="items-end" />}
                      compact
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {google && <DatumValue datum={google.cpc} format={(i) => formatMoney(i.p50)} compact />}
                  </TableCell>
                  <TableCell className="pr-5">
                    <DatumValue datum={c.competition.current} format={(v) => `${COMPETITION_LABELS[v.level]} (${Math.round(v.index)})`} compact />
                    <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {anyCapped && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted-foreground">
          * Score plafonné à 35 : le coût d&apos;acquisition estimé dépasse la marge unitaire saisie.
        </p>
      )}
    </div>
  );
}
