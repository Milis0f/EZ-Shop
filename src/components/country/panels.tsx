import type { ReactNode } from "react";
import { DatumValue } from "@/components/data/datum-value";
import { IntervalBar, IntervalValue } from "@/components/data/interval-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { isKnown } from "@/domain/datum";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { cn } from "@/lib/utils";
import { advancedMessages, byId } from "@/components/data/labels";
import { monthLabel } from "@/engine/report/localize";
import type { Locale } from "@/i18n/config";
import { formatCompact, formatDecimal, formatInt, formatMoney, formatPct } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { PLATFORM_LABELS } from "@/lib/format";

export function Stat({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-2 text-base">{children}</dd>
      {hint && <dd className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** KPI strip: one bordered panel split into equal cells, so figures line up across the row. */
export const KPI_GRID =
  "panel grid min-w-0 grid-cols-2 gap-px overflow-hidden bg-line [&>div]:bg-surface [&>div]:px-4 [&>div]:py-5 sm:[&>div]:px-[22px]";

export function KeyFigures({ c, locale }: { c: CountryAnalysis; locale: Locale }) {
  const { demand } = c;
  const all = advancedMessages(locale);
  const m = all.panels;
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3 lg:grid-cols-6")}>
      <Stat label={m.searches}>
        <DatumValue datum={demand.avgMonthlySearches} format={(v) => <AnimatedNumber value={v} format="int" />} />
      </Stat>
      <Stat label={m.trend} hint={isKnown(demand.trend) ? all.labels.trend[demand.trend.value.direction] : undefined}>
        <DatumValue
          datum={demand.trend}
          format={(t) => (
            <>
              <AnimatedNumber value={t.annualGrowthPct} format="percentSigned" />
              {m.perYear}
            </>
          )}
        />
      </Stat>
      <Stat label={m.demand12}>
        <DatumValue datum={demand.futureGrowthPct} format={(v) => <AnimatedNumber value={v} format="percentSigned" />} />
      </Stat>
      <Stat label={m.peakMonths}>
        <DatumValue
          datum={demand.seasonality}
          format={(s) => (s.isSeasonal ? s.peakMonths.map((p) => monthLabel(p, locale)).join(", ") : m.noPeak)}
        />
      </Stat>
      <Stat label={m.competitionNow}>
        <DatumValue datum={c.competition.current} format={(v) => `${all.labels.competition[v.level]}, ${Math.round(v.index)}/100`} />
      </Stat>
      <Stat label={m.competitionSoon}>
        <DatumValue datum={c.competition.future} format={(v) => all.labels.outlook[v.outlook]} />
      </Stat>
    </dl>
  );
}

const BIG = "text-2xl font-semibold tracking-tight";

export function SalesPanel({ c, economics, locale }: { c: CountryAnalysis; economics: UnitEconomics; locale: Locale }) {
  const m = advancedMessages(locale).panels;
  const compact = (v: number) => formatCompact(v, locale);
  const { sales } = c;
  const max = isKnown(sales.annualOrders) ? sales.annualOrders.value.p90 : 0;
  return (
    <dl className={cn(KPI_GRID, "grid-cols-1 sm:grid-cols-3 [&>div]:py-6")}>
      <Stat label={m.monthlyOrders} hint={m.monthlyOrdersHint}>
        <DatumValue
          datum={sales.monthlyOrders}
          format={(i) => <IntervalValue interval={i} format={compact} locale={locale} countUp={{ format: "compact" }} valueClassName={BIG} />}
        />
      </Stat>
      <Stat label={m.annualOrders}>
        <DatumValue
          datum={sales.annualOrders}
          format={(i) => (
            <span className="flex flex-col gap-2.5">
              <IntervalValue interval={i} format={compact} locale={locale} countUp={{ format: "compact" }} valueClassName={BIG} />
              <IntervalBar interval={i} max={max} className="w-full max-w-40" />
            </span>
          )}
        />
      </Stat>
      <Stat label={m.annualRevenue}>
        <DatumValue
          datum={sales.annualRevenue}
          format={(i) => (
            <IntervalValue
              interval={i}
              format={(v) => formatMoney(v, locale, economics.currency)}
              locale={locale}
              countUp={{ format: "money", currency: economics.currency }}
              valueClassName={BIG}
            />
          )}
        />
      </Stat>
    </dl>
  );
}

export function AdCostsTable({ c, locale }: { c: CountryAnalysis; locale: Locale }) {
  const m = advancedMessages(locale).panels;
  const toMoney = (v: number) => formatMoney(v, locale);
  const money = (i: Parameters<typeof IntervalValue>[0]["interval"]) => <IntervalValue interval={i} format={toMoney} locale={locale} className="items-end" />;
  return (
    <div className="panel min-w-0 overflow-hidden p-1.5">
      <Table className="min-w-[34rem] [&_td]:py-4 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th]:h-12 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5">
        <TableHeader>
          <TableRow className="border-line hover:bg-transparent">
            <TableHead>{m.platform}</TableHead>
            <TableHead className="text-right">{m.cpc}</TableHead>
            <TableHead className="text-right">{m.cpa}</TableHead>
            <TableHead className="text-right">{m.testBudget}</TableHead>
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
                    <IntervalValue interval={i} format={toMoney} locale={locale} countUp={{ format: "money" }} className="items-end" valueClassName="font-medium" />
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

export function CompetitionPanel({ c, locale }: { c: CountryAnalysis; locale: Locale }) {
  const { competition } = c;
  const all = advancedMessages(locale);
  const m = all.panels;
  const activity = (label: string, d: CountryAnalysis["competition"]["meta"]) => (
    <Stat label={label}>
      <DatumValue datum={d} format={(a) => t(m.activity, { ads: formatInt(a.activeAds, locale), advertisers: formatInt(a.uniqueAdvertisers, locale) })} />
    </Stat>
  );
  return (
    <div className="panel grid min-w-0 gap-8 p-5 sm:p-[26px] min-[900px]:grid-cols-2 min-[900px]:gap-12">
      <dl className="grid gap-7">
        <Stat label={m.googleIndex}>
          <DatumValue datum={competition.googleCompetitionIndex} format={(v) => `${formatDecimal(v, locale)}/100`} />
        </Stat>
        {activity("Meta Ad Library", competition.meta)}
        {activity("TikTok Commercial Content", competition.tiktok)}
      </dl>
      <dl className="grid content-start gap-7">
        <Stat label={m.combined} hint={m.combinedHint}>
          <DatumValue
            datum={competition.current}
            format={(v) => (
              <span>
                {all.labels.competition[v.level]} ({formatDecimal(v.index, locale)}/100)
                <span className="block text-xs text-muted-foreground">{v.components.map((x) => byId(all.breakdown.components, x.id, x.label)).join(", ")}</span>
              </span>
            )}
          />
        </Stat>
        <Stat label={m.pressure} hint={m.pressureHint}>
          <DatumValue
            datum={competition.future}
            format={(v) =>
              t(m.pressureValue, {
                outlook: all.labels.outlook[v.outlook],
                growth: formatPct(v.monthlyGrowthPct, locale, { signed: true }),
                weeks: formatInt(v.weeksUsed, locale),
              })
            }
          />
        </Stat>
      </dl>
    </div>
  );
}

export function MarketPanel({ c, locale }: { c: CountryAnalysis; locale: Locale }) {
  const { market } = c;
  const m = advancedMessages(locale).panels;
  const pct = (v: number) => formatPct(v, locale);
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3 lg:grid-cols-5")}>
      <Stat label={m.population}>
        <DatumValue datum={market.population} format={(v) => formatCompact(v, locale)} />
      </Stat>
      <Stat label={m.gdp}>
        <DatumValue datum={market.gdpPerCapitaPpp} format={(v) => formatInt(v, locale)} />
      </Stat>
      <Stat label={m.internet}>
        <DatumValue datum={market.internetUsersPct} format={pct} />
      </Stat>
      <Stat label={m.onlineBuyers}>
        <DatumValue datum={market.onlineBuyersPct} format={pct} />
      </Stat>
      <Stat label={m.consumerConfidence} hint={m.consumerConfidenceHint}>
        <DatumValue datum={market.consumerConfidence} format={(v) => formatDecimal(v, locale)} />
      </Stat>
    </dl>
  );
}
