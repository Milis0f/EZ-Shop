import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AiInsight } from "@/components/analysis/ai-insight";
import { DemandChart } from "@/components/country/demand-chart";
import { CountryTag } from "@/components/data/country-tag";
import { ModeToggle } from "@/components/layout/mode-toggle";
import type { AnalysisResult, CountryAnalysis } from "@/domain/analysis";
import { COUNTRIES, LANGUAGE_LABELS_FR } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { MONTH_LABELS_FR } from "@/domain/time";
import { interestPerMonth, rankForSimple, verdictFor, type VerdictLevel } from "@/engine/report/simple-summary";
import { formatCompact, formatDate, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const LEVEL_TONE: Record<VerdictLevel, string> = {
  good: "text-decision-prioritize",
  test: "text-decision-test",
  weak: "text-decision-avoid",
  uncertain: "text-decision-explore",
  unknown: "text-muted-foreground",
};

function Tile({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 bg-surface px-5 py-5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight">{children}</dd>
      {hint && <dd className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</dd>}
    </div>
  );
}

const none = <span className="text-base font-normal text-muted-foreground">non disponible</span>;

function KeyFigures({ c }: { c: CountryAnalysis }) {
  const interest = interestPerMonth(c);
  const { trend, seasonality } = c.demand;
  const s = c.signals;
  return (
    <dl className="panel grid grid-cols-2 gap-px overflow-hidden bg-line lg:grid-cols-4">
      <Tile label="Personnes intéressées" hint={interest ? interest.label : "Volume de recherche indisponible sans Google Ads"}>
        {interest ? <AnimatedNumber value={interest.value} format="compact" /> : none}
      </Tile>
      <Tile label="Tendance sur 3 ans" hint={isKnown(trend) ? (trend.value.direction === "rising" ? "En hausse" : trend.value.direction === "declining" ? "En baisse" : "Stable") : undefined}>
        {isKnown(trend) ? <><AnimatedNumber value={trend.value.annualGrowthPct} format="percentSigned" /><span className="text-base font-normal text-muted-foreground">/an</span></> : none}
      </Tile>
      <Tile label="Période de pic" hint={isKnown(seasonality) && seasonality.value.isSeasonal ? `Saisonnalité ${Math.round(seasonality.value.strength * 100)} %` : undefined}>
        {isKnown(seasonality) ? (seasonality.value.isSeasonal ? seasonality.value.peakMonths.map((m) => MONTH_LABELS_FR[m - 1]).join(", ") : "Toute l'année") : none}
      </Tile>
      <Tile
        label="Recherches associées"
        hint={s && isKnown(s.searchSuggestions) ? `Dont ${s.searchSuggestions.value.intent.length} d'achat et ${s.searchSuggestions.value.marketplaces.length} de marketplace` : undefined}
      >
        {s && isKnown(s.searchSuggestions) ? <AnimatedNumber value={s.searchSuggestions.value.suggestions.length} format="int" /> : none}
      </Tile>
    </dl>
  );
}

function CountriesTable({ analysisId, countries }: { analysisId: string; countries: readonly CountryAnalysis[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted-foreground">
            <th className="px-5 py-3 font-medium">Pays</th>
            <th className="px-3 py-3 font-medium">Verdict</th>
            <th className="px-3 py-3 text-right font-medium">Tendance</th>
            <th className="px-3 py-3 font-medium">Pic</th>
            <th className="px-5 py-3 text-right font-medium">Intéressés / mois</th>
          </tr>
        </thead>
        <tbody>
          {countries.map((c) => {
            const v = verdictFor(c);
            const interest = interestPerMonth(c);
            const { trend, seasonality } = c.demand;
            return (
              <tr key={c.country} className="group relative border-b border-line transition-colors duration-[var(--dur-fast)] last:border-0 hover:bg-surface-2">
                <td className="px-5 py-3">
                  <Link href={`/analyses/${analysisId}/${c.country.toLowerCase()}`} className="flex items-center gap-2 font-medium after:absolute after:inset-0 group-hover:underline">
                    <CountryTag code={c.country} />
                    {COUNTRIES[c.country].nameFr}
                  </Link>
                </td>
                <td className={cn("px-3 py-3 font-medium", LEVEL_TONE[v.level])}>{v.title}</td>
                <td className="px-3 py-3 text-right">{isKnown(trend) ? formatPct(trend.value.annualGrowthPct, true) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-3">
                  {isKnown(seasonality) ? (seasonality.value.isSeasonal ? MONTH_LABELS_FR[(seasonality.value.peakMonths[0] ?? 1) - 1] : "régulier") : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  {interest ? (
                    <span title={interest.label}>
                      {formatCompact(interest.value)}
                      {!interest.direct && <span className="ml-1 text-[11px] text-muted-foreground">(Wikipédia)</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Simple mode: one verdict, four figures, the history month by month, and a small table when several countries were analysed. */
export function SimpleReport({ analysis }: { analysis: AnalysisResult }) {
  const ranked = rankForSimple(analysis.countries);
  const main = analysis.countries.find((c) => c.country === "FR") ?? ranked[0];
  if (!main) return null;
  const verdict = verdictFor(main);
  const history = isKnown(main.demand.history) ? main.demand.history.value : null;
  const forecast = isKnown(main.demand.forecast) ? main.demand.forecast.value.points : null;
  const machine = analysis.product.terms.filter((t) => t.source === "machine");
  const world = analysis.countries.length > 1;
  const throttled = analysis.countries.filter((c) => c.issues.some((i) => i.providerId === "wikimedia" && i.code === "rate_limited"));

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <Link href="/" className="interactive group inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform duration-[var(--dur-fast)] group-hover:-translate-x-0.5" aria-hidden />
        Nouvelle analyse
      </Link>

      <header className="animate-enter mt-8 text-center">
        <p className="text-sm text-muted-foreground">
          {world ? `${analysis.countries.length} pays` : COUNTRIES[main.country].nameFr}, {formatDate(analysis.createdAt)}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{analysis.product.displayName}</h1>
        {machine.length > 0 && (
          <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Traduit automatiquement :{" "}
            {machine
              .slice(0, 6)
              .map((t) => `${t.term} (${LANGUAGE_LABELS_FR[t.language].toLowerCase()})`)
              .join(", ")}
            {machine.length > 6 ? "…" : ""}
          </p>
        )}
      </header>

      <section aria-label="Verdict" className="panel animate-enter mt-12 p-6 text-center sm:p-8" style={{ "--stagger": 1 } as React.CSSProperties}>
        <p className="text-xs text-muted-foreground">{world ? `Verdict pour ${COUNTRIES[main.country].nameFr}` : "Verdict"}</p>
        <p className={cn("mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", LEVEL_TONE[verdict.level])}>{verdict.title}</p>
        {verdict.reasons.length > 0 && (
          <ul className="mx-auto mt-5 max-w-xl space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {verdict.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {world && ranked[0] && ranked[0].country !== main.country && (
          <p className="mt-5 text-sm">
            Pays le plus prometteur : <span className="font-medium">{COUNTRIES[ranked[0].country].nameFr}</span> ({verdictFor(ranked[0]).title.toLowerCase()}).
          </p>
        )}
      </section>

      <section aria-label="Lecture par l'IA locale" className="mt-6">
        <AiInsight analysisId={analysis.id} />
      </section>

      <div className="animate-enter mt-6" style={{ "--stagger": 2 } as React.CSSProperties}>
        <KeyFigures c={main} />
      </div>

      <section aria-labelledby="archives-title" className="mt-16">
        <h2 id="archives-title" className="text-lg font-semibold tracking-tight">
          Archives : l&apos;intérêt mois par mois
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {history
            ? history.basis === "absolute_volume"
              ? `Recherches Google par mois en ${COUNTRIES[main.country].nameFr}, puis projection sur 12 mois.`
              : history.basis === "topic_interest"
                ? "Lectures mensuelles de l'article Wikipédia de la catégorie (par langue) : la forme de l'intérêt, pas un nombre de recherches."
                : "Indice d'intérêt Google Trends (0 à 100) : la forme de la demande, pas un volume."
            : "Aucun historique disponible pour ce produit."}
        </p>
        {history && (
          <div className="panel mt-6 p-6">
            <DemandChart basis={history.basis} history={history.series} forecast={forecast} />
          </div>
        )}
      </section>

      {world && (
        <section aria-labelledby="countries-title" className="mt-16">
          <h2 id="countries-title" className="text-lg font-semibold tracking-tight">
            Pays par pays
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Du plus prometteur au moins prometteur. Clique sur un pays pour le détail.</p>
          <div className="mt-6">
            <CountriesTable analysisId={analysis.id} countries={ranked} />
          </div>
        </section>
      )}

      {throttled.length > 0 && (
        <p className="mt-6 rounded-lg border border-decision-test/30 bg-decision-test/8 px-4 py-3 text-sm text-decision-test">
          Wikipédia a limité les requêtes : {throttled.length} pays sans archives. Sans contact déclaré, Wikimedia accepte 10 requêtes par
          minute ; ajoute un contact dans Sources de données (mode avancé) pour passer à 200.
        </p>
      )}

      <div className="mt-16 flex flex-col items-center gap-3 text-center">
        <ModeToggle variant="button" label="Voir l'analyse complète" />
        <p className="text-xs text-muted-foreground">Sources, taxes, marges, méthode et détail du score.</p>
      </div>
    </div>
  );
}
