import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AiInsight } from "@/components/analysis/ai-insight";
import { ReasonPills } from "@/components/analysis/reason-pills";
import { MissingSourcesPanel, SourceJournalPanel } from "@/components/analysis/source-journal";
import { VERDICT_COLOR, VerdictOrb } from "@/components/analysis/verdict-orb";
import { DemandChart } from "@/components/country/demand-chart";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Reveal, RevealGroup } from "@/components/motion/reveal";
import type { AnalysisResult, CountryAnalysis, UnitEconomics } from "@/domain/analysis";
import { COUNTRIES, LANGUAGE_LABELS_FR } from "@/domain/country";
import { DATA_INSUFFICIENT, isKnown, type Datum } from "@/domain/datum";
import { MONTH_LABELS_FR } from "@/domain/time";
import { interestPerMonth, rankForSimple } from "@/engine/report/simple-summary";
import { sourceJournal } from "@/engine/report/source-journal";
import { verdictFor } from "@/engine/report/verdict";
import { formatCompact, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The pills follow the orb in the verdict reveal: they start this many steps after it. */
const PILLS_START_INDEX = 6;
const REVEAL_STEP_MS = 80;

const longDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
/** Unit prices keep their cents. */
const unitPrice = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const none = <span className="text-base font-normal text-muted-foreground">non disponible</span>;

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
  const interest = interestPerMonth(c);
  const { trend, seasonality } = c.demand;
  const s = c.signals;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
      <Figure label="Personnes intéressées" hint={interest ? interest.label : "Volume de recherche indisponible sans Google Ads"}>
        {interest ? <AnimatedNumber value={interest.value} format="compact" /> : none}
      </Figure>
      <Figure
        label="Tendance sur 3 ans"
        hint={isKnown(trend) ? (trend.value.direction === "rising" ? "par an, en hausse" : trend.value.direction === "declining" ? "par an, en baisse" : "par an, stable") : undefined}
      >
        {isKnown(trend) ? <AnimatedNumber value={trend.value.annualGrowthPct} format="percentSigned" /> : none}
      </Figure>
      <Figure label="Période de pic" hint={isKnown(seasonality) && seasonality.value.isSeasonal ? `Saisonnalité ${Math.round(seasonality.value.strength * 100)} %` : undefined}>
        {isKnown(seasonality) ? (seasonality.value.isSeasonal ? seasonality.value.peakMonths.map((m) => MONTH_LABELS_FR[m - 1]).join(", ") : "Toute l'année") : none}
      </Figure>
      <Figure
        label="Recherches associées"
        hint={s && isKnown(s.searchSuggestions) ? `Dont ${s.searchSuggestions.value.intent.length} d'achat et ${s.searchSuggestions.value.marketplaces.length} de marketplace` : undefined}
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
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{datum && !isKnown(datum) ? datum.reason : "Non calculé pour cette analyse ancienne."}</p>
        </>
      )}
    </div>
  );
}

/** « Ta marge »: only the owner's typed prices, with duties and VAT of the country. Nothing from marketplaces. */
function MarginPanel({ c, economics, world }: { c: CountryAnalysis; economics: UnitEconomics; world: boolean }) {
  const landed = c.signals?.landedUnitCostEur;
  const margin = c.signals?.marginAtPlannedPrice;
  const minimum = c.signals?.minPriceForTargetMargin;
  return (
    <section aria-labelledby="margin-title" className="panel p-6 sm:p-[26px]">
      <h2 id="margin-title" className="text-[17px] font-semibold">
        Ta marge
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        À partir des prix saisis par toi{world ? `, pour ${COUNTRIES[c.country].nameFr}` : ""}, droits de douane et TVA du pays compris.
      </p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        <MarginTile label="Coût de revient par unité" datum={landed} hint={landed && isKnown(landed) ? landed.note : undefined}>
          {landed && isKnown(landed) ? unitPrice.format(landed.value) : null}
        </MarginTile>
        <MarginTile
          label="Marge à ton prix"
          datum={margin}
          hint={economics.sellingPrice !== undefined ? `À ${unitPrice.format(economics.sellingPrice)} TTC, saisi par toi, hors TVA.` : undefined}
        >
          {margin && isKnown(margin) ? <AnimatedNumber value={margin.value} format="percent" /> : null}
        </MarginTile>
        <MarginTile
          label="Prix minimum pour ta marge"
          datum={minimum}
          hint={
            minimum && isKnown(minimum)
              ? `${minimum.value.inclVatEur !== null ? `${unitPrice.format(minimum.value.inclVatEur)} TTC, ` : ""}pour ${minimum.value.targetMarginPct} % de marge saisis par toi.`
              : undefined
          }
        >
          {minimum && isKnown(minimum) ? `${unitPrice.format(minimum.value.exVatEur)} HT` : null}
        </MarginTile>
      </div>
    </section>
  );
}

function CountryRows({ analysisId, countries }: { analysisId: string; countries: readonly CountryAnalysis[] }) {
  return (
    <div>
      <div aria-hidden className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_8rem] gap-4 px-5 pb-2 text-xs text-muted-foreground min-[900px]:grid">
        <span>Pays</span>
        <span>Verdict</span>
        <span className="text-right">Tendance</span>
        <span>Pic</span>
        <span className="text-right">Intéressés / mois</span>
      </div>
      <ul className="flex flex-col gap-2">
        {countries.map((c) => {
          const v = verdictFor(c);
          const interest = interestPerMonth(c);
          const { trend, seasonality } = c.demand;
          const peak = isKnown(seasonality) ? (seasonality.value.isSeasonal ? MONTH_LABELS_FR[(seasonality.value.peakMonths[0] ?? 1) - 1] : "régulier") : "—";
          return (
            <li key={c.country}>
              <Link
                href={`/analyses/${analysisId}/${c.country.toLowerCase()}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-tile border border-line bg-surface px-5 py-3.5 text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-surface-2 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_8rem] min-[900px]:rounded-pill"
              >
                <span className="flex min-w-0 items-center gap-3 font-medium">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: VERDICT_COLOR[v.value] }} />
                  <span className="truncate group-hover:underline">{COUNTRIES[c.country].nameFr}</span>
                </span>
                <span className="text-right font-medium min-[900px]:text-left" style={{ color: VERDICT_COLOR[v.value] }}>
                  {v.label}
                </span>
                <span className="tabular col-span-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground min-[900px]:contents min-[900px]:text-sm min-[900px]:text-foreground">
                  <span className="min-[900px]:text-right">
                    <span className="min-[900px]:sr-only">Tendance </span>
                    {isKnown(trend) ? formatPct(trend.value.annualGrowthPct, true) : "—"}
                  </span>
                  <span>
                    <span className="min-[900px]:sr-only">Pic </span>
                    {peak}
                  </span>
                  <span className="min-[900px]:text-right" title={interest?.label}>
                    <span className="min-[900px]:sr-only">Intéressés par mois </span>
                    {interest ? formatCompact(interest.value) : "—"}
                    {interest && !interest.direct && <span className="ml-1 text-[11px] text-muted-foreground">(Wikipédia)</span>}
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
  const ranked = rankForSimple(analysis.countries);
  const main = analysis.countries.find((c) => c.country === "FR") ?? ranked[0];
  if (!main) return null;
  const verdict = verdictFor(main);
  const journal = sourceJournal(analysis);
  const history = isKnown(main.demand.history) ? main.demand.history.value : null;
  const forecast = isKnown(main.demand.forecast) ? main.demand.forecast.value.points : null;
  const machine = analysis.product.terms.filter((t) => t.source === "machine");
  const world = analysis.countries.length > 1;
  const throttled = analysis.countries.filter((c) => c.issues.some((i) => i.providerId === "wikimedia" && i.code === "rate_limited"));
  const best = ranked[0];

  return (
    <div className="mx-auto max-w-[1040px] pb-16">
      <Link href="/" className="group inline-flex items-center gap-1.5 rounded-pill text-sm text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:-translate-x-0.5" strokeWidth={1.5} aria-hidden />
        Nouvelle analyse
      </Link>

      <header className="mt-7 text-center">
        <h1 className="font-display text-[40px] leading-[1.05] font-bold tracking-[-0.035em] [overflow-wrap:anywhere] text-balance sm:text-[64px]">
          {analysis.product.displayName}
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          {world ? `${analysis.countries.length} pays` : COUNTRIES[main.country].nameFr}, analysée le {longDate.format(new Date(analysis.createdAt))}
        </p>
        {machine.length > 0 && (
          <p className="mx-auto mt-3 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Traduit automatiquement :{" "}
            {machine
              .slice(0, 6)
              .map((t) => `${t.term} (${LANGUAGE_LABELS_FR[t.language].toLowerCase()})`)
              .join(", ")}
            {machine.length > 6 ? "…" : ""}
          </p>
        )}
      </header>

      <RevealGroup as="section" trigger="mount" step={REVEAL_STEP_MS} aria-label="Verdict" className="mt-11 overflow-x-clip pb-1">
        <Reveal className="grid place-items-center">
          <VerdictOrb verdict={verdict} confidence={main.scoring.confidence.score} />
        </Reveal>
        {world && (
          <Reveal as="p" index={PILLS_START_INDEX - 1} className="mt-5 text-center text-sm text-muted-foreground">
            Verdict pour {COUNTRIES[main.country].nameFr}
            {best && best.country !== main.country ? `, pays le plus prometteur : ${COUNTRIES[best.country].nameFr} (${verdictFor(best).label})` : ""}
          </Reveal>
        )}
        <ReasonPills verdict={verdict} startIndex={PILLS_START_INDEX} className="mt-7" />
      </RevealGroup>

      <section aria-label="Lecture par l'IA locale" className="mx-auto mt-10 max-w-3xl">
        <AiInsight analysisId={analysis.id} />
      </section>

      <div className="mt-10">
        <KeyFigures c={main} />
      </div>

      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="archives-title" className="panel min-w-0 p-6 sm:p-[26px]">
          <h2 id="archives-title" className="text-[17px] font-semibold">
            Archives : l&apos;intérêt mois par mois
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {history
              ? history.basis === "absolute_volume"
                ? `Recherches Google par mois en ${COUNTRIES[main.country].nameFr}, puis projection sur 12 mois en pointillé.`
                : history.basis === "topic_interest"
                  ? "Lectures Wikipédia de la catégorie, pas des recherches. Projection sur 12 mois en pointillé."
                  : "Indice d'intérêt Google Trends (0 à 100) : la forme de la demande, pas un volume."
              : "Aucun historique disponible pour ce produit."}
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
        <p className="mt-4 rounded-tile border border-line bg-surface px-5 py-4 text-sm text-muted-foreground">
          Wikipédia a limité les requêtes : {throttled.length} pays sans archives. Sans contact déclaré, Wikimedia accepte 10 requêtes par minute ;
          ajoute un contact dans Sources de données (mode avancé) pour passer à 200.
        </p>
      )}

      {world && (
        <section aria-labelledby="countries-title" className="mt-14">
          <h2 id="countries-title" className="text-lg font-semibold tracking-tight">
            Pays par pays
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Du plus prometteur au moins prometteur. Choisis un pays pour le détail.</p>
          <div className="mt-5">
            <CountryRows analysisId={analysis.id} countries={ranked} />
          </div>
        </section>
      )}

      <SourceJournalPanel rows={journal} countryCount={analysis.countries.length} className={cn(world ? "mt-10" : "mt-4")} />

      <div className="mt-14 flex flex-col items-center gap-3 text-center">
        <ModeToggle variant="button" label="Voir l'analyse complète" />
        <p className="text-xs text-muted-foreground">Sources, taxes, marges, méthode et détail du score.</p>
      </div>
    </div>
  );
}
