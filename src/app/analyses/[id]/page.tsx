import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AnalysisHeader } from "@/components/analysis/analysis-header";
import { AnalysisSkeleton } from "@/components/analysis/analysis-skeleton";
import { AnalysisSummary } from "@/components/analysis/analysis-summary";
import { AssumptionsTable } from "@/components/analysis/assumptions-table";
import { CountryRanking } from "@/components/analysis/country-ranking";
import { DataGaps } from "@/components/analysis/data-gaps";
import { MarketTable } from "@/components/analysis/market-table";
import { OpportunityMap, type MapPoint } from "@/components/analysis/opportunity-map";
import { SourcingPanel } from "@/components/analysis/sourcing-panel";
import { SimpleReport } from "@/components/analysis/simple-report";
import { SuccessNotice } from "@/components/analysis/success-notice";
import { DECISION_THRESHOLDS } from "@/config/scoring";
import type { AnalysisResult } from "@/domain/analysis";
import { COUNTRIES } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { getAnalysis } from "@/server/services";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}

export default function AnalysisPage({ params, searchParams }: PageProps) {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Real run time, measured by the pipeline; no figure is shown when it was not recorded. */
function createdMessage(analysis: AnalysisResult): string {
  const n = analysis.countries.length;
  const ms = analysis.completedAt ? Date.parse(analysis.completedAt) - Date.parse(analysis.createdAt) : Number.NaN;
  const duration = Number.isFinite(ms) && ms >= 0 ? ` en ${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s` : "";
  return `Analyse terminée${duration} pour ${n} pays.`;
}

function SectionTitle({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {children && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  );
}

async function AnalysisContent({ params, searchParams }: PageProps) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  // Stored analyses are read at request time only (never during prerender / prefetch).
  await connection();
  const analysis = await getAnalysis(id);
  if (!analysis) notFound();

  const points: MapPoint[] = analysis.countries.flatMap((c) =>
    isKnown(c.scoring.score)
      ? [{ code: c.country, name: COUNTRIES[c.country].nameFr, score: c.scoring.score.value.total, confidence: c.scoring.confidence.score, mock: c.scoring.confidence.mockTainted }]
      : [],
  );
  const unscored = analysis.countries.length - points.length;

  return (
    <>
      <div className="simple:block hidden">
        <SimpleReport analysis={analysis} />
      </div>
      <div className="advanced:block hidden">
        <AdvancedAnalysis analysis={analysis} points={points} unscored={unscored} created={created} />
      </div>
    </>
  );
}

function AdvancedAnalysis({ analysis, points, unscored, created }: { analysis: AnalysisResult; points: MapPoint[]; unscored: number; created?: string }) {
  return (
    <>
      {created === "1" && analysis.status !== "failed" && <SuccessNotice message={createdMessage(analysis)} />}
      <AnalysisHeader analysis={analysis} />

      <AnalysisSummary countries={analysis.countries} />

      <section aria-labelledby="map-title" className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="panel animate-enter p-6" style={{ "--stagger": 5 } as React.CSSProperties}>
          <SectionTitle id="map-title" title="Où lancer en premier">
            Chaque pays noté est placé selon son score d&apos;opportunité et, séparément, la confiance qu&apos;on peut accorder aux
            données. Clique sur un point pour le détail.
          </SectionTitle>
          {points.length > 0 ? (
            <OpportunityMap analysisId={analysis.id} points={points} thresholds={DECISION_THRESHOLDS} />
          ) : (
            <div className="hatch flex h-64 items-center justify-center rounded-lg border border-dashed border-line px-6 text-center text-sm text-muted-foreground">
              Aucun pays n&apos;a assez de données pour être noté. Les sources de demande (Keyword Planner ou Trends) sont nécessaires.
            </div>
          )}
          {unscored > 0 && points.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">{unscored} pays non notés faute de données, listés dans le comparatif.</p>
          )}
        </div>
        <aside aria-labelledby="gaps-title" className="panel animate-enter self-start p-6" style={{ "--stagger": 6 } as React.CSSProperties}>
          <SectionTitle id="gaps-title" title="Limites de l'analyse" />
          <DataGaps countries={analysis.countries} />
        </aside>
      </section>

      <section aria-labelledby="ranking-title" className="mt-20">
        <SectionTitle id="ranking-title" title="Comparatif des pays">
          Ventes et chiffre d&apos;affaires : scénario central, avec la fourchette P10 à P90 en dessous. Clique sur une ligne pour
          le détail du pays.
        </SectionTitle>
        <CountryRanking analysisId={analysis.id} countries={analysis.countries} economics={analysis.economics} />
      </section>

      {analysis.countries.some((c) => c.signals) && (
        <section aria-labelledby="market-title" className="mt-20">
          <SectionTitle id="market-title" title="Marché, prix et taxes">
            Prix réels sur eBay, coût d&apos;une unité importée (achat + droits de douane) et signaux d&apos;intérêt, pays par pays.
          </SectionTitle>
          <MarketTable analysisId={analysis.id} countries={analysis.countries} />
        </section>
      )}

      {(analysis.sourcing || analysis.classification) && (
        <section aria-labelledby="sourcing-title" className="mt-20">
          <SectionTitle id="sourcing-title" title="Sourcing et douane">
            Communs à tous les pays : d&apos;où part le produit, son code douanier et ce qu&apos;il coûte à l&apos;achat.
          </SectionTitle>
          <SourcingPanel origin={analysis.input.originCountry} classification={analysis.classification} sourcing={analysis.sourcing} />
        </section>
      )}

      <section aria-labelledby="assumptions-title" className="mt-20">
        <SectionTitle id="assumptions-title" title="Hypothèses utilisées">
          Elles ne sont pas mesurées. Les ventes, CPA et budgets de test en dépendent directement. Ouvre une ligne pour voir
          pourquoi cette fourchette.
        </SectionTitle>
        <AssumptionsTable assumptions={analysis.assumptions} />
      </section>
    </>
  );
}
