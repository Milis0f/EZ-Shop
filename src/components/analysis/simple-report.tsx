"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AiInsight } from "@/components/analysis/ai-insight";
import { ReasonPills } from "@/components/analysis/reason-pills";
import { MissingSourcesPanel, SourceJournalPanel } from "@/components/analysis/source-journal";
import { VERDICT_COLOR, VerdictOrb } from "@/components/analysis/verdict-orb";
import { DemandChart } from "@/components/country/demand-chart";
import { engineText } from "@/components/data/engine-text";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal, RevealGroup } from "@/components/motion/reveal";
import type { AnalysisResult, CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { DATA_INSUFFICIENT, isKnown, type Datum } from "@/domain/datum";
import { countryName, interestLabel, languageName, monthLabel, monthList, unitPrice, verdictWord } from "@/engine/report/localize";
import { interestPerMonth, rankForSimple } from "@/engine/report/simple-summary";
import { sourceJournal } from "@/engine/report/source-journal";
import { verdictFor } from "@/engine/report/verdict";
import { useFormat, useMessages } from "@/i18n/client";
import { INTL_LOCALES } from "@/i18n/config";
import { formatPct } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";

/** The pills follow the orb in the verdict reveal: they start this many steps after it. */
const PILLS_START_INDEX = 6;
const REVEAL_STEP_MS = 80;

type ReportMessages = Messages<"report">;

function NotAvailable({ m }: { m: ReportMessages }) {
  return <span className="text-base font-normal text-muted-foreground">{m.figures.notAvailable}</span>;
}

function Figure({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 bg-surface px-5 pt-6 pb-5 sm:px-[26px]">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="tabular mt-2.5 text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] sm:text-[34px]">{children}</dd>
      {hint && <dd className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</dd>}
    </div>
  );
}

function KeyFigures({ c }: { c: CountryAnalysis }) {
  const m = useMessages("report");
  const f = useFormat();
  const fig = m.figures;
  const interest = interestPerMonth(c);
  const { trend, seasonality } = c.demand;
  const s = c.signals;
  const none = <NotAvailable m={m} />;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
      {/* A Wikipedia audience is a proxy: it is never labelled as people interested or searches. */}
      <Figure label={interest && !interest.direct ? fig.wikiReaders : fig.interested} hint={interest ? interestLabel(interest, f.locale) : fig.noVolume}>
        {interest ? <AnimatedNumber value={interest.value} format="compact" /> : none}
      </Figure>
      <Figure
        label={fig.trend}
        hint={isKnown(trend) ? (trend.value.direction === "rising" ? fig.trendRising : trend.value.direction === "declining" ? fig.trendDeclining : fig.trendStable) : undefined}
      >
        {isKnown(trend) ? <AnimatedNumber value={trend.value.annualGrowthPct} format="percentSigned" /> : none}
      </Figure>
      <Figure
        label={fig.peak}
        hint={isKnown(seasonality) && seasonality.value.isSeasonal ? t(fig.seasonality, { strength: f.pct(Math.round(seasonality.value.strength * 100)) }) : undefined}
      >
        {isKnown(seasonality) ? (seasonality.value.isSeasonal ? monthList(seasonality.value.peakMonths, f.locale) : fig.allYear) : none}
      </Figure>
      <Figure
        label={fig.related}
        hint={
          s && isKnown(s.searchSuggestions)
            ? t(fig.relatedHint, { intent: f.int(s.searchSuggestions.value.intent.length), marketplaces: f.int(s.searchSuggestions.value.marketplaces.length) })
            : undefined
        }
      >
        {s && isKnown(s.searchSuggestions) ? <AnimatedNumber value={s.searchSuggestions.value.suggestions.length} format="int" /> : none}
      </Figure>
    </dl>
  );
}

function hasPrices(e: UnitEconomics): boolean {
  return [e.supplierPrice, e.shippingCost, e.landedCost, e.sellingPrice, e.targetMarginPct].some((v) => v !== undefined);
}

function MarginTile({ label, datum, children, hint }: { label: string; datum: Datum<unknown> | undefined; children: ReactNode; hint?: string }) {
  const m = useMessages("report").margin;
  const { locale } = useFormat();
  return (
    <div className="min-w-0 rounded-tile bg-surface-2 px-5 py-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      {datum && isKnown(datum) ? (
        <>
          <p className="tabular mt-1.5 text-2xl font-semibold tracking-[-0.02em]">{children}</p>
          {hint && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
        </>
      ) : (
        <>
          <p className="hatch mt-2 inline-flex rounded-pill border border-kind-missing/70 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{DATA_INSUFFICIENT}</p>
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{datum && !isKnown(datum) ? engineText(datum.reason, locale) : m.notComputed}</p>
        </>
      )}
    </div>
  );
}

/** « Ta marge »: only the owner's typed prices, with duties and VAT of the country. Nothing from marketplaces. */
function MarginPanel({ c, economics, world }: { c: CountryAnalysis; economics: UnitEconomics; world: boolean }) {
  const m = useMessages("report").margin;
  const { locale } = useFormat();
  const price = (v: number) => unitPrice(v, locale);
  const landed = c.signals?.landedUnitCostEur;
  const margin = c.signals?.marginAtPlannedPrice;
  const minimum = c.signals?.minPriceForTargetMargin;
  return (
    <section aria-labelledby="margin-title" className="panel p-6 sm:p-[26px]">
      <h2 id="margin-title" className="text-[17px] font-semibold">
        {m.title}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t(m.intro, { country: world ? t(m.introCountry, { country: countryName(c.country, locale) }) : "" })}
      </p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <MarginTile label={m.landedCost} datum={landed} hint={landed && isKnown(landed) && landed.note ? engineText(landed.note, locale) : undefined}>
          {landed && isKnown(landed) ? price(landed.value) : null}
        </MarginTile>
        <MarginTile
          label={m.atYourPrice}
          datum={margin}
          hint={economics.sellingPrice !== undefined ? t(m.atYourPriceHint, { price: price(economics.sellingPrice) }) : undefined}
        >
          {margin && isKnown(margin) ? <AnimatedNumber value={margin.value} format="percent" /> : null}
        </MarginTile>
        <MarginTile
          label={m.minimum}
          datum={minimum}
          hint={
            minimum && isKnown(minimum)
              ? t(m.minimumHint, {
                  incl: minimum.value.inclVatEur !== null ? t(m.minimumHintInclVat, { price: price(minimum.value.inclVatEur) }) : "",
                  target: formatPct(minimum.value.targetMarginPct, locale),
                })
              : undefined
          }
        >
          {minimum && isKnown(minimum) ? t(m.minimumValue, { price: price(minimum.value.exVatEur) }) : null}
        </MarginTile>
      </div>
    </section>
  );
}

function CountryRows({ analysisId, countries }: { analysisId: string; countries: readonly CountryAnalysis[] }) {
  const m = useMessages("report");
  const f = useFormat();
  const r = m.rows;
  const interests = countries.map(interestPerMonth).filter((i) => i !== null);
  const onlyWikipedia = interests.length > 0 && interests.every((i) => !i.direct);
  return (
    <div>
      <div aria-hidden className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_8rem] gap-4 px-5 pb-2 text-xs text-muted-foreground min-[900px]:grid">
        <span>{r.country}</span>
        <span>{r.verdict}</span>
        <span className="text-right">{r.trend}</span>
        <span>{r.peak}</span>
        <span className="text-right">{onlyWikipedia ? r.wikiReadersPerMonth : r.interestedPerMonth}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {countries.map((c) => {
          const v = verdictFor(c);
          const interest = interestPerMonth(c);
          const { trend, seasonality } = c.demand;
          const peak = isKnown(seasonality) ? (seasonality.value.isSeasonal ? monthLabel(seasonality.value.peakMonths[0] ?? 1, f.locale) : r.steady) : "—";
          return (
            <li key={c.country}>
              <Link
                href={`/analyses/${analysisId}/${c.country.toLowerCase()}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-tile border border-line bg-surface px-5 py-3.5 text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-surface-2 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_8rem] min-[900px]:rounded-pill"
              >
                <span className="flex min-w-0 items-center gap-3 font-medium">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: VERDICT_COLOR[v.value] }} />
                  <span className="truncate group-hover:underline">{countryName(c.country, f.locale)}</span>
                </span>
                <span className="text-right font-medium min-[900px]:text-left" style={{ color: VERDICT_COLOR[v.value] }}>
                  {verdictWord(v.value, f.locale)}
                </span>
                <span className="tabular col-span-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground min-[900px]:contents min-[900px]:text-sm min-[900px]:text-foreground">
                  <span className="min-[900px]:text-right">
                    <span className="min-[900px]:sr-only">{r.trendSr}</span>
                    {isKnown(trend) ? f.pct(trend.value.annualGrowthPct, { signed: true }) : "—"}
                  </span>
                  <span>
                    <span className="min-[900px]:sr-only">{r.peakSr}</span>
                    {peak}
                  </span>
                  <span className="min-[900px]:text-right" title={interest ? interestLabel(interest, f.locale) : undefined}>
                    <span className="min-[900px]:sr-only">{interest && !interest.direct ? `${m.figures.wikiReaders} ` : r.interestedSr}</span>
                    {interest ? f.compact(interest.value) : "—"}
                    {interest && !interest.direct && <span className="ml-1 text-[11px] text-muted-foreground">{r.wikipedia}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Simple mode: the verdict orb, its reasons, four figures, the history, what is missing, and the margin. */
export function SimpleReport({ analysis }: { analysis: AnalysisResult }) {
  const m = useMessages("report");
  const f = useFormat();
  const p = m.page;
  const ranked = rankForSimple(analysis.countries);
  const main = analysis.countries.find((c) => c.country === "FR") ?? ranked[0];
  if (!main) return null;
  const verdict = verdictFor(main);
  const journal = sourceJournal(analysis);
  const history = isKnown(main.demand.history) ? main.demand.history.value : null;
  const forecast = isKnown(main.demand.forecast) ? main.demand.forecast.value.points : null;
  const machine = analysis.product.terms.filter((term) => term.source === "machine");
  const world = analysis.countries.length > 1;
  const throttled = analysis.countries.filter((c) => c.issues.some((i) => i.providerId === "wikimedia" && i.code === "rate_limited"));
  const best = ranked[0];
  const mainName = countryName(main.country, f.locale);
  const longDate = new Intl.DateTimeFormat(INTL_LOCALES[f.locale], { dateStyle: "long" });

  return (
    <div className="mx-auto max-w-[1040px] pb-16">
      <Link href="/" className="group inline-flex items-center gap-1.5 rounded-pill text-sm text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:-translate-x-0.5" strokeWidth={1.5} aria-hidden />
        {p.newAnalysis}
      </Link>

      <header className="mt-7 text-center">
        <h1 className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.035em] [overflow-wrap:anywhere] text-balance sm:text-[64px]">
          {analysis.product.displayName}
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          {t(p.analysedOn, {
            place: world ? t(p.countryCount, { count: f.int(analysis.countries.length) }) : mainName,
            date: longDate.format(new Date(analysis.createdAt)),
          })}
        </p>
        {machine.length > 0 && (
          <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {p.machineTranslated}{" "}
            {machine
              .slice(0, 6)
              .map((term) => `${term.term} (${f.locale === "en" ? languageName(term.language, f.locale) : languageName(term.language, f.locale).toLowerCase()})`)
              .join(", ")}
            {machine.length > 6 ? "…" : ""}
          </p>
        )}
      </header>

      <RevealGroup as="section" trigger="mount" step={REVEAL_STEP_MS} aria-label={p.verdictAria} className="mt-11 overflow-x-clip pb-1">
        <Reveal className="grid place-items-center">
          <VerdictOrb verdict={verdict} confidence={main.scoring.confidence.score} />
        </Reveal>
        {world && (
          <Reveal as="p" index={PILLS_START_INDEX - 1} className="mt-5 text-center text-sm text-muted-foreground">
            {t(p.verdictFor, { country: mainName })}
            {best && best.country !== main.country
              ? t(p.mostPromising, { country: countryName(best.country, f.locale), verdict: verdictWord(verdictFor(best).value, f.locale) })
              : ""}
          </Reveal>
        )}
        <ReasonPills verdict={verdict} startIndex={PILLS_START_INDEX} className="mt-7" />
      </RevealGroup>

      <section aria-label={p.aiAria} className="mx-auto mt-10 max-w-3xl">
        <AiInsight analysisId={analysis.id} />
      </section>

      <div className="mt-10">
        <KeyFigures c={main} />
      </div>

      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="archives-title" className="panel min-w-0 p-6 sm:p-[26px]">
          <h2 id="archives-title" className="text-[17px] font-semibold">
            {m.archives.title}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {history
              ? history.basis === "absolute_volume"
                ? t(m.archives.searches, { country: mainName })
                : history.basis === "topic_interest"
                  ? m.archives.wikipedia
                  : m.archives.trends
              : m.archives.none}
          </p>
          {history && (
            <div className="mt-5">
              <DemandChart basis={history.basis} history={history.series} forecast={forecast} />
            </div>
          )}
        </section>
        <MissingSourcesPanel country={main} journal={journal} className="min-w-0" />
      </div>

      {hasPrices(analysis.economics) && (
        <div className="mt-4">
          <MarginPanel c={main} economics={analysis.economics} world={world} />
        </div>
      )}

      {throttled.length > 0 && (
        <p className="mt-4 rounded-tile border border-line bg-surface px-5 py-4 text-sm text-muted-foreground">{t(p.throttled, { count: f.int(throttled.length) })}</p>
      )}

      {world && (
        <section aria-labelledby="countries-title" className="mt-14">
          <h2 id="countries-title" className="text-lg font-semibold tracking-tight">
            {p.countriesTitle}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{p.countriesIntro}</p>
          <div className="mt-5">
            <CountryRows analysisId={analysis.id} countries={ranked} />
          </div>
        </section>
      )}

      <SourceJournalPanel rows={journal} countryCount={analysis.countries.length} className={cn(world ? "mt-10" : "mt-4")} />

      <div className="mt-14 flex flex-col items-center gap-3 text-center">
        <ModeToggle variant="button" label={p.fullAnalysis} />
        <p className="text-xs text-muted-foreground">{p.fullAnalysisHint}</p>
      </div>
    </div>
  );
}
