import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EpistemicLegend } from "@/components/data/epistemic-legend";
import { DecisionZones } from "@/components/methodology/decision-zones";
import { SectionNav } from "@/components/methodology/section-nav";
import {
  CRITERION_WEIGHTS,
  DECISION_THRESHOLDS,
  FORECAST_PARAMS,
  SCORING_MODEL_VERSION,
  SCORING_POLICY,
} from "@/config/scoring";
import { DEFAULT_CRITERIA } from "@/engine/scoring/criteria";

export const metadata: Metadata = { title: "Méthode" };

const SECTIONS = [
  { id: "valeurs", label: "Nature des valeurs" },
  { id: "demande", label: "Demande" },
  { id: "ventes", label: "Ventes et CA" },
  { id: "publicite", label: "Coûts publicitaires" },
  { id: "score", label: "Score d'opportunité" },
  { id: "confiance", label: "Confiance et décision" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function Block({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)?.label;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 border-t border-line pt-10 first:border-t-0 first:pt-0">
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-5 max-w-[68ch] space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A formula reads as a statement, set apart from the prose around it. */
const Formula = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border-l-2 border-foreground/40 bg-surface-2/60 px-4 py-3 text-[15px] text-foreground">{children}</p>
);

export default function MethodologyPage() {
  const maxWeight = Math.max(...DEFAULT_CRITERIA.map((c) => CRITERION_WEIGHTS[c.id]));
  const totalWeight = DEFAULT_CRITERIA.reduce((s, c) => s + CRITERION_WEIGHTS[c.id], 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Méthode</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Modèle de score {SCORING_MODEL_VERSION}. Analyse strictement au niveau pays, uniquement sur des données externes : aucune vente,
          campagne ou statistique de boutique n&apos;entre dans le calcul.
        </p>
      </header>

      <div className="mt-14 grid gap-12 lg:grid-cols-[13rem_1fr] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-8">
            <SectionNav items={SECTIONS} />
          </div>
        </aside>

        <div className="animate-enter space-y-14" style={{ "--stagger": 1 } as React.CSSProperties}>
          <Block id="valeurs">
            <p>Chaque valeur affichée porte sa nature. Survoler une valeur montre sa méthode, ses sources et sa période.</p>
            <EpistemicLegend className="mt-4 max-w-md" />
          </Block>

          <Block id="demande">
            <p>
              Volumes absolus : Google Ads Keyword Planner. Forme de la demande : Google Trends (indice relatif 0–100). Quand les deux
              existent, l&apos;indice Trends est calé sur les volumes Keyword Planner et leur corrélation alimente la confiance.
            </p>
            <Formula>log(1 + demande) = a + b × mois + effet du mois de l&apos;année + erreur</Formula>
            <p>
              Tendance dès {FORECAST_PARAMS.minMonthsForTrend} mois ; saisonnalité et prévision à partir de{" "}
              {FORECAST_PARAMS.minMonthsForSeasonality} mois. L&apos;intervalle P10–P90 vient de l&apos;erreur de prédiction du modèle.
              Limite : l&apos;autocorrélation des résidus est ignorée, l&apos;incertitude réelle est probablement plus large.
            </p>
          </Block>

          <Block id="ventes">
            <Formula>commandes = demande projetée × part de demande captée × taux de conversion</Formula>
            <p>
              Simulation Monte Carlo de 5 000 tirages. Les deux taux sont des hypothèses affichées dans chaque analyse. Sans volume absolu
              de recherche, aucune vente n&apos;est estimée. Le chiffre d&apos;affaires exige un prix de vente saisi.
            </p>
          </Block>

          <Block id="publicite">
            <Formula>CPA = CPC ÷ taux de conversion ; budget de test = CPA × conversions visées</Formula>
            <p>
              Google : l&apos;enchère haut de page P20–P80 de Keyword Planner sert de proxy du CPC, probablement un majorant. Meta et
              TikTok : estimations officielles uniquement via un compte publicitaire ; sinon, données insuffisantes.
            </p>
          </Block>

          <Block id="score">
            <p>
              {DEFAULT_CRITERIA.length} critères, {totalWeight} points au total. La barre montre le poids de chaque critère.
            </p>
            <ul className="panel divide-y divide-line overflow-hidden">
              {DEFAULT_CRITERIA.map((c, i) => (
                <li key={c.id} className="grid grid-cols-[1fr_5rem_3.5rem] items-center gap-4 px-4 py-3">
                  <span className="text-foreground">{c.label}</span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="animate-bar block h-full rounded-full bg-foreground"
                      style={{ width: `${(CRITERION_WEIGHTS[c.id] / maxWeight) * 100}%`, "--stagger": i } as React.CSSProperties}
                    />
                  </span>
                  <span className="text-right text-foreground"><span className="tabular">{CRITERION_WEIGHTS[c.id]}</span> pts</span>
                </li>
              ))}
            </ul>
            <p>
              Les poids sont renormalisés sur les critères disponibles. Pas de score sous {Math.round(SCORING_POLICY.minCoverage * 100)} %
              de couverture, ni sans critère de demande. Plafond à {SCORING_POLICY.negativeEconomicsCap} quand le CPA estimé dépasse la
              marge. Les bornes de normalisation sont absolues : le score d&apos;un pays ne dépend pas des autres pays comparés.
            </p>
          </Block>

          <Block id="confiance">
            <Formula>confiance = couverture × fraîcheur × qualité des sources × cohérence inter-sources</Formula>
            <p>
              Toujours calculée à part du score. Décision : prioriser au-delà d&apos;un score de {DECISION_THRESHOLDS.prioritizeScore} avec{" "}
              {DECISION_THRESHOLDS.prioritizeConfidence} % de confiance ; tester prudemment à partir de {DECISION_THRESHOLDS.testScore} ;
              exploratoire seulement sous {DECISION_THRESHOLDS.minConfidence} % de confiance, quel que soit le score.
            </p>
            <DecisionZones t={DECISION_THRESHOLDS} />
          </Block>
        </div>
      </div>
    </div>
  );
}
