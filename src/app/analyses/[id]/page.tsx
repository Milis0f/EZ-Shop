import type { Metadata } from "next";
import { WebResearchAsk } from "@/components/web/web-research";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AnalysisHeader } from "@/components/analysis/analysis-header";
import { LegacyMockNotice } from "@/components/data/legacy-mock-notice";
import { AnalysisSkeleton } from "@/components/analysis/analysis-skeleton";
import { AiInsight } from "@/components/analysis/ai-insight";
import { AnalysisSummary } from "@/components/analysis/analysis-summary";
import { AssumptionsTable } from "@/components/analysis/assumptions-table";
import { CountryRanking } from "@/components/analysis/country-ranking";
import { DataGaps } from "@/components/analysis/data-gaps";
import { MarketTable } from "@/components/analysis/market-table";
import { OpportunityMap, type MapPoint } from "@/components/analysis/opportunity-map";
import { SourcingPanel } from "@/components/analysis/sourcing-panel";
import { SimpleReport } from "@/components/analysis/simple-report";
import { SourceJournalPanel } from "@/components/analysis/source-journal";
import { SuccessNotice } from "@/components/analysis/success-notice";
import { DECISION_THRESHOLDS } from "@/config/scoring";
import type { AnalysisResult } from "@/domain/analysis";
import { advancedMessages } from "@/components/data/labels";
import { isKnown } from "@/domain/datum";
import { sourceJournal } from "@/engine/report/source-journal";
import { countryName } from "@/engine/report/localize";
import { verdictFor } from "@/engine/report/verdict";
import type { Locale } from "@/i18n/config";
import { formatDecimal, formatInt } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { plural } from "@/i18n/translate";
import { getAnalysis } from "@/server/services";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}

/** Tab title: the product name, read at request time like the page itself. */
export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const [{ id }, locale] = await Promise.all([params, getLocale()]);
  await connection();
  const analysis = await getAnalysis(id);
  return { title: analysis ? analysis.product.displayName : advancedMessages(locale).page.notFound };
}

export default async function AnalysisPage({ params, searchParams }: PageProps) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl min-w-0">
      <Suspense fallback={<AnalysisSkeleton locale={locale} />}>
        <AnalysisContent params={params} searchParams={searchParams} locale={locale} />
      </Suspense>
    </div>
  );
}

/** Real run time, measured by the pipeline; no figure is shown when it was not recorded. */
function createdMessage(analysis: AnalysisResult, locale: Locale): string {
  const m = advancedMessages(locale).page;
  const n = analysis.countries.length;
  const ms = analysis.completedAt ? Date.parse(analysis.completedAt) - Date.parse(analysis.createdAt) : Number.NaN;
  const count = formatInt(n, locale);
  return Number.isFinite(ms) && ms >= 0
    ? plural(locale, n, m.createdIn, { count, seconds: formatDecimal(ms / 1000, locale) })
    : plural(locale, n, m.created, { count });
}

function SectionTitle({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

async function AnalysisContent({ params, searchParams, locale }: PageProps & { locale: Locale }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  // Stored analyses are read at request time only (never during prerender / prefetch).
  await connection();
  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const points: MapPoint[] = analysis.countries.flatMap((c) =>
    isKnown(c.scoring.score)
      ? [
          {
            code: c.country,
            name: countryName(c.country, locale),
            score: c.scoring.score.value.total,
            confidence: c.scoring.confidence.score,
            mock: c.scoring.confidence.mockTainted,
            verdict: verdictFor(c).value,
          },
        ]
      : [],
  );
  const unscored = analysis.countries.length - points.length;

  return (
    <>
      <LegacyMockNotice dataMode={analysis.dataMode} />
      <div className="simple:block hidden">
        <SimpleReport analysis={analysis} />
      </div>
      <div className="advanced:block hidden">
        <AdvancedAnalysis analysis={analysis} points={points} unscored={unscored} created={created} locale={locale} />
      </div>
    </>
  );
}

interface AdvancedAnalysisProps {
  readonly analysis: AnalysisResult;
  readonly points: MapPoint[];
  readonly unscored: number;
  readonly created?: string;
  readonly locale: Locale;
}

function AdvancedAnalysis({ analysis, points, unscored, created, locale }: AdvancedAnalysisProps) {
  const journal = sourceJournal(analysis);
  const m = advancedMessages(locale).page;
  return (
    <div className="pb-16">
      {created === "1" && analysis.status !== "failed" && <SuccessNotice message={createdMessage(analysis, locale)} />}
      <AnalysisHeader analysis={analysis} locale={locale} />

      <AnalysisSummary countries={analysis.countries} locale={locale} />

      <section aria-labelledby="ai-title" className="mt-14 max-w-4xl">
        <SectionTitle id="ai-title" title={m.ai.title}>
          {m.ai.intro}
        </SectionTitle>
        <AiInsight analysisId={analysis.id} />
        <WebResearchAsk query={analysis.input.productName} className="mt-4" />
      </section>

      <section aria-labelledby="map-title" className="mt-14 grid grid-cols-1 gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="panel min-w-0 p-5 sm:p-[26px]">
          <SectionTitle id="map-title" title={m.map.title}>
            {m.map.intro}
          </SectionTitle>
          {points.length > 0 ? (
            <OpportunityMap analysisId={analysis.id} points={points} thresholds={DECISION_THRESHOLDS} />
          ) : (
            <div className="hatch flex h-64 items-center justify-center rounded-tile border border-dashed border-line px-6 text-center text-sm text-muted-foreground">
              {m.map.empty}
            </div>
          )}
          {unscored > 0 && points.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{plural(locale, unscored, m.map.unscored, { count: formatInt(unscored, locale) })}</p>
          )}
        </div>
        <aside aria-labelledby="gaps-title" className="panel min-w-0 self-start p-5 sm:p-[26px]">
          <SectionTitle id="gaps-title" title={m.gapsTitle} />
          <DataGaps countries={analysis.countries} locale={locale} />
        </aside>
      </section>

      <section aria-labelledby="ranking-title" className="mt-16">
        <SectionTitle id="ranking-title" title={m.ranking.title}>
          {m.ranking.intro}
        </SectionTitle>
        <CountryRanking analysisId={analysis.id} countries={analysis.countries} economics={analysis.economics} locale={locale} />
      </section>

      {analysis.countries.some((c) => c.signals) && (
        <section aria-labelledby="market-title" className="mt-16">
          <SectionTitle id="market-title" title={m.market.title}>
            {m.market.intro}
          </SectionTitle>
          <MarketTable analysisId={analysis.id} countries={analysis.countries} locale={locale} />
        </section>
      )}

      {(analysis.sourcing || analysis.classification) && (
        <section aria-labelledby="sourcing-title" className="mt-16">
          <SectionTitle id="sourcing-title" title={m.sourcing.title}>
            {m.sourcing.intro}
          </SectionTitle>
          <SourcingPanel origin={analysis.input.originCountry} classification={analysis.classification} sourcing={analysis.sourcing} locale={locale} />
        </section>
      )}

      <section aria-labelledby="assumptions-title" className="mt-16">
        <SectionTitle id="assumptions-title" title={m.assumptions.title}>
          {m.assumptions.intro}
        </SectionTitle>
        <AssumptionsTable assumptions={analysis.assumptions} locale={locale} />
      </section>

      <SourceJournalPanel rows={journal} countryCount={analysis.countries.length} className="mt-16" />
    </div>
  );
}
