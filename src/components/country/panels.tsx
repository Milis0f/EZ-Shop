import type { ReactNode } from "react";
import { DatumValue } from "@/components/data/datum-value";
import { IntervalBar, IntervalValue } from "@/components/data/interval-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import { MONTH_LABELS_FR } from "@/domain/time";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { cn } from "@/lib/utils";
import {
  COMPETITION_LABELS,
  formatCompact,
  formatDecimal,
  formatInt,
  formatMoney,
  formatPct,
  OUTLOOK_LABELS,
  PLATFORM_LABELS,
  TREND_LABELS,
} from "@/lib/format";

export function Stat({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-base">{children}</dd>
      {hint && <dd className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** KPI strip: one bordered panel split into equal cells, so figures line up across the row. */
export const KPI_GRID = "panel grid grid-cols-2 gap-px overflow-hidden bg-line [&>div]:bg-surface [&>div]:px-5 [&>div]:py-5";

export function KeyFigures({ c }: { c: CountryAnalysis }) {
  const { demand } = c;
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3 lg:grid-cols-6")}>
      <Stat label="Recherches par mois">
        <DatumValue datum={demand.avgMonthlySearches} format={(v) => <AnimatedNumber value={v} format="int" />} />
      </Stat>
      <Stat label="Tendance historique" hint={isKnown(demand.trend) ? TREND_LABELS[demand.trend.value.direction] : undefined}>
        <DatumValue
          datum={demand.trend}
          format={(t) => (
            <>
              <AnimatedNumber value={t.annualGrowthPct} format="percentSigned" />
              /an
            </>
          )}
        />
      </Stat>
      <Stat label="Demande à 12 mois">
        <DatumValue datum={demand.futureGrowthPct} format={(v) => <AnimatedNumber value={v} format="percentSigned" />} />
      </Stat>
      <Stat label="Mois de pic">
        <DatumValue
          datum={demand.seasonality}
          format={(s) => (s.isSeasonal ? s.peakMonths.map((m) => MONTH_LABELS_FR[m - 1]).join(", ") : "Pas de pic marqué")}
        />
      </Stat>
      <Stat label="Concurrence actuelle">
        <DatumValue datum={c.competition.current} format={(v) => `${COMPETITION_LABELS[v.level]}, ${Math.round(v.index)}/100`} />
      </Stat>
      <Stat label="Concurrence à 3–6 mois">
        <DatumValue datum={c.competition.future} format={(v) => OUTLOOK_LABELS[v.outlook]} />
      </Stat>
    </dl>
  );
}

const BIG = "text-2xl font-semibold tracking-tight";

export function SalesPanel({ c, economics }: { c: CountryAnalysis; economics: UnitEconomics }) {
  const { sales } = c;
  const max = isKnown(sales.annualOrders) ? sales.annualOrders.value.p90 : 0;
  return (
    <dl className={cn(KPI_GRID, "grid-cols-1 sm:grid-cols-3 [&>div]:py-6")}>
      <Stat label="Commandes par mois" hint="Moyenne sur les 12 prochains mois">
        <DatumValue
          datum={sales.monthlyOrders}
          format={(i) => <IntervalValue interval={i} format={formatCompact} countUp={{ format: "compact" }} valueClassName={BIG} />}
        />
      </Stat>
      <Stat label="Commandes sur 12 mois">
        <DatumValue
          datum={sales.annualOrders}
          format={(i) => (
            <span className="flex flex-col gap-2.5">
              <IntervalValue interval={i} format={formatCompact} countUp={{ format: "compact" }} valueClassName={BIG} />
              <IntervalBar interval={i} max={max} className="w-full max-w-40" />
            </span>
          )}
        />
      </Stat>
      <Stat label="Chiffre d'affaires HT sur 12 mois">
        <DatumValue
          datum={sales.annualRevenue}
          format={(i) => (
            <IntervalValue
              interval={i}
              format={(v) => formatMoney(v, economics.currency)}
              countUp={{ format: "money", currency: economics.currency }}
              valueClassName={BIG}
            />
          )}
        />
      </Stat>
    </dl>
  );
}

export function AdCostsTable({ c }: { c: CountryAnalysis }) {
  const money = (i: Parameters<typeof IntervalValue>[0]["interval"]) => <IntervalValue interval={i} format={(v) => formatMoney(v)} className="items-end" />;
  return (
    <div className="panel overflow-x-auto">
      <Table className="min-w-[34rem] [&_td]:py-4 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:h-12 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead>Plateforme</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead className="text-right">Budget de test</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.advertising.map((ch) => (
            <TableRow key={ch.platform} className="border-line transition-colors duration-[var(--dur-fast)] hover:bg-surface-2/70">
              <TableCell className="font-medium">{PLATFORM_LABELS[ch.platform]}</TableCell>
              <TableCell className="text-right">
                <DatumValue datum={ch.cpc} format={money} />
              </TableCell>
              <TableCell className="text-right">
                <DatumValue datum={ch.cpa} format={money} />
              </TableCell>
              <TableCell className="text-right">
                <DatumValue
                  datum={ch.testBudget}
                  format={(i) => (
                    <IntervalValue interval={i} format={(v) => formatMoney(v)} countUp={{ format: "money" }} className="items-end" valueClassName="font-medium" />
                  )}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function CompetitionPanel({ c }: { c: CountryAnalysis }) {
  const { competition } = c;
  const activity = (label: string, d: CountryAnalysis["competition"]["meta"]) => (
    <Stat label={label}>
      <DatumValue datum={d} format={(a) => `${formatInt(a.activeAds)} annonces actives, ${formatInt(a.uniqueAdvertisers)} annonceurs`} />
    </Stat>
  );
  return (
    <div className="panel grid gap-10 p-6 lg:grid-cols-2 lg:gap-12">
      <dl className="grid gap-7">
        <Stat label="Indice de concurrence Google Ads">
          <DatumValue datum={competition.googleCompetitionIndex} format={(v) => `${formatDecimal(v)}/100`} />
        </Stat>
        {activity("Meta Ad Library", competition.meta)}
        {activity("TikTok Commercial Content", competition.tiktok)}
      </dl>
      <dl className="grid content-start gap-7">
        <Stat label="Indice combiné" hint="Pondéré sur les sources disponibles">
          <DatumValue
            datum={competition.current}
            format={(v) => (
              <span>
                {COMPETITION_LABELS[v.level]} ({formatDecimal(v.index)}/100)
                <span className="block text-xs text-muted-foreground">{v.components.map((x) => x.label).join(", ")}</span>
              </span>
            )}
          />
        </Stat>
        <Stat label="Pression concurrentielle à 3–6 mois" hint="Projection des nouvelles annonces visibles, pas du nombre réel de concurrents">
          <DatumValue
            datum={competition.future}
            format={(v) => `${OUTLOOK_LABELS[v.outlook]}, ${formatPct(v.monthlyGrowthPct, true)} par mois sur ${v.weeksUsed} semaines`}
          />
        </Stat>
      </dl>
    </div>
  );
}

export function MarketPanel({ c }: { c: CountryAnalysis }) {
  const { market } = c;
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3 lg:grid-cols-5")}>
      <Stat label="Population">
        <DatumValue datum={market.population} format={formatCompact} />
      </Stat>
      <Stat label="PIB par habitant (PPA, $ int.)">
        <DatumValue datum={market.gdpPerCapitaPpp} format={formatInt} />
      </Stat>
      <Stat label="Internautes">
        <DatumValue datum={market.internetUsersPct} format={(v) => formatPct(v)} />
      </Stat>
      <Stat label="Acheteurs en ligne (12 mois)">
        <DatumValue datum={market.onlineBuyersPct} format={(v) => formatPct(v)} />
      </Stat>
      <Stat label="Confiance des consommateurs" hint="Moyenne long terme = 100">
        <DatumValue datum={market.consumerConfidence} format={formatDecimal} />
      </Stat>
    </dl>
  );
}
