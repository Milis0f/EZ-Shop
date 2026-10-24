import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { DecisionBadge } from "@/components/analysis/decision-badge";
import { ConfidenceMeter, ScoreMeter } from "@/components/analysis/meters";
import { DatumValue } from "@/components/data/datum-value";
import { MockBanner } from "@/components/data/mock-banner";
import { DemandChart } from "@/components/country/demand-chart";
import { AdCostsTable, CompetitionPanel, KeyFigures, MarketPanel, SalesPanel } from "@/components/country/panels";
import { ProvenancePanel } from "@/components/country/provenance-panel";
import { ConfidencePanel, CriteriaBreakdown } from "@/components/country/score-breakdown";
import { SeasonalityChart } from "@/components/country/seasonality-chart";
import { InterestPanel, MarketplacePanel, TaxesPanel } from "@/components/country/signals-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryTag } from "@/components/data/country-tag";
import { COUNTRIES, isCountryCode, LANGUAGE_LABELS_FR } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { originName } from "@/domain/origin";
import { missingLabel } from "@/lib/format";
import { getAnalysis } from "@/server/services";

interface PageProps {
  readonly params: Promise<{ id: string; country: string }>;
}

export default function CountryPage({ params }: PageProps) {
  return (
    <div className="mx-auto max-w-7xl">
      <Suspense fallback={<CountrySkeleton />}>
        <CountryContent params={params} />
      </Suspense>
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-20 scroll-mt-8">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {intro && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Missing series: says why, and where to fix it. Never an empty chart frame. */
function InsufficientBlock({ reason, missing, className }: { reason: string; missing: readonly string[]; className?: string }) {
  return (
    <div className={`hatch flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line px-6 text-center ${className ?? ""}`}>
      <p className="max-w-sm text-sm">{reason}</p>
      {missing.length > 0 && <p className="text-xs text-muted-foreground">Manque : {missing.map(missingLabel).join(", ")}</p>}
      <Link href="/connectors" className="interactive inline-flex items-center gap-1 rounded-md text-xs font-medium underline-offset-4 hover:underline">
        Voir les sources de données
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

async function CountryContent({ params }: PageProps) {
  const { id, country: raw } = await params;
  const code = raw.toUpperCase();
  if (!isCountryCode(code)) notFound();
  await connection();
  const analysis = await getAnalysis(id);
  const c = analysis?.countries.find((x) => x.country === code);
  if (!analysis || !c) notFound();

  const country = COUNTRIES[code];
  const { demand, scoring } = c;
  const history = isKnown(demand.history) ? demand.history.value : null;
  const forecast = isKnown(demand.forecast) ? demand.forecast.value.points : null;
  const origin = analysis.input.originCountry ? originName(analysis.input.originCountry) : "un pays d'origine non renseigné";

  return (
    <>
      <Link
        href={`/analyses/${analysis.id}`}
        className="interactive group inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform duration-[var(--dur-fast)] group-hover:-translate-x-0.5" aria-hidden />
        Comparatif {analysis.product.displayName}
      </Link>

      <header className="animate-enter mt-8 mb-10">
        {analysis.dataMode === "mock" && <MockBanner />}
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {country.nameFr}
              <CountryTag code={code} className="text-xs" />
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Termes ({LANGUAGE_LABELS_FR[c.terms[0]?.language ?? country.languages[0]]}) :{" "}
              <span className="text-foreground">{c.terms.map((t) => t.term).join(", ")}</span>
            </p>
            {c.languageMismatch && (
              <p className="mt-2 text-sm text-decision-test">Aucun terme dans la langue du pays : le terme d&apos;origine est utilisé tel quel.</p>
            )}
          </div>
          <dl className="panel grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-[auto_auto_auto] sm:gap-x-10 sm:px-6">
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">Décision</dt>
              <dd className="mt-2 max-w-[13rem]">
                <DecisionBadge decision={scoring.decision} withHint />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Score d&apos;opportunité</dt>
              <dd className="mt-2">
                {isKnown(scoring.score) ? (
                  <ScoreMeter value={scoring.score.value.total} size="lg" />
                ) : (
                  <DatumValue datum={scoring.score} format={() => null} />
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confiance</dt>
              <dd className="mt-2">
                <ConfidenceMeter value={scoring.confidence.score} size="lg" />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <KeyFigures c={c} />

      <Section
        id="demand"
        title="Demande de recherche"
        intro="Historique observé puis projection sur 12 mois. Un indice Trends décrit la forme de la demande, jamais son volume."
      >
        <div className="panel grid gap-10 p-6 lg:grid-cols-[1fr_20rem] lg:gap-12">
          {history ? (
            <DemandChart basis={history.basis} history={history.series} forecast={forecast} />
          ) : (
            !isKnown(demand.history) && <InsufficientBlock reason={demand.history.reason} missing={demand.history.missing} className="h-72" />
          )}
          <div className="lg:border-l lg:border-line lg:pl-10">
            <h3 className="text-sm font-medium">Saisonnalité</h3>
            {isKnown(demand.seasonality) ? (
              <>
                <SeasonalityChart monthlyIndex={demand.seasonality.value.monthlyIndex} peakMonths={demand.seasonality.value.peakMonths} />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Force saisonnière {Math.round(demand.seasonality.value.strength * 100)} % sur {demand.seasonality.value.yearsUsed} ans. Ligne
                  pointillée : mois moyen.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm">
                <DatumValue datum={demand.seasonality} format={() => null} />
              </p>
            )}
          </div>
        </div>
      </Section>

      {c.signals && (
        <Section
          id="interest"
          title="Intérêt et intention d'achat"
          intro="Signaux indirects : ce que les gens tapent après le nom du produit, et les vidéos publiées. Aucun n'est un volume de recherche."
        >
          <InterestPanel signals={c.signals} />
        </Section>
      )}

      <Section
        id="sales"
        title="Potentiel commercial"
        intro="Potentiel avant lancement, pas une prévision de ventes : demande projetée × part captée × taux de conversion, simulé 5 000 fois."
      >
        <SalesPanel c={c} economics={analysis.economics} />
        <h3 className="mt-10 mb-4 text-sm font-medium">Coûts publicitaires estimés</h3>
        <AdCostsTable c={c} />
      </Section>

      {c.signals && (
        <Section
          id="marketplace"
          title="Marché et prix (eBay)"
          intro="Annonces et prix réels du produit sur le site eBay du pays : offre visible, prix de marché et marge possible."
        >
          <MarketplacePanel signals={c.signals} />
        </Section>
      )}

      {c.signals && (
        <Section
          id="taxes"
          title="Taxes à l'import"
          intro={`Droits de douane d'une unité expédiée depuis ${origin} vers ce pays, et TVA locale. Les droits entrent dans le coût unitaire et la marge.`}
        >
          <TaxesPanel signals={c.signals} />
        </Section>
      )}

      <Section id="competition" title="Concurrence" intro="Présence publicitaire visible. Elle ne révèle ni les ventes ni les budgets des concurrents.">
        <CompetitionPanel c={c} />
      </Section>

      <Section id="score" title="Détail du score" intro="Chaque critère avec son poids, sa contribution et la valeur qui la justifie.">
        <CriteriaBreakdown scoring={scoring} />
      </Section>

      <Section id="confidence" title="Confiance" intro="Indépendante du score : elle mesure la qualité des données, pas l'intérêt du marché.">
        <ConfidencePanel confidence={scoring.confidence} />
      </Section>

      <Section id="market" title="Contexte du pays">
        <MarketPanel c={c} />
      </Section>

      <Section id="provenance" title="Provenance des données" intro="Toutes les sources ayant alimenté ce pays, avec leur période et leur date de collecte.">
        <ProvenancePanel c={c} />
      </Section>
    </>
  );
}

function CountrySkeleton() {
  return (
    <div role="status" aria-label="Chargement du pays">
      <Skeleton className="h-4 w-56" />
      <div className="mt-8 grid items-end gap-8 lg:grid-cols-[1fr_auto]">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-4 h-4 w-80" />
        </div>
        <Skeleton className="h-28 w-[30rem] max-w-full rounded-panel" />
      </div>
      <Skeleton className="mt-10 h-24 rounded-panel" />
      <Skeleton className="mt-20 h-5 w-48" />
      <Skeleton className="mt-6 h-[22rem] rounded-panel" />
    </div>
  );
}
