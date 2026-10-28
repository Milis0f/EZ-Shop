import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EpistemicLegend } from "@/components/data/epistemic-legend";
import { DecisionZones } from "@/components/methodology/decision-zones";
import { SectionNav } from "@/components/methodology/section-nav";
import { VerdictTable } from "@/components/methodology/verdict-table";
import {
  CRITERION_WEIGHTS,
  DECISION_THRESHOLDS,
  FORECAST_PARAMS,
  SCORING_MODEL_VERSION,
  SCORING_POLICY,
} from "@/config/scoring";
import { DEFAULT_CRITERIA } from "@/engine/scoring/criteria";
import { formatInt, formatPct } from "@/i18n/format";
import { getLocale, getMessages } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { LOCAL_AI_MODEL_INFO } from "@/server/ai/engine";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("methodology");
  return { title: m.metadataTitle };
}

/** Anchor ids stay the same in every language, so shared links keep working; only the labels change. */
const SECTIONS = [
  { id: "valeurs", key: "values" },
  { id: "demande", key: "demand" },
  { id: "ventes", key: "sales" },
  { id: "publicite", key: "ads" },
  { id: "score", key: "score" },
  { id: "confiance", key: "confidence" },
  { id: "verdict", key: "verdict" },
  { id: "ia", key: "ai" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Size of the Monte Carlo simulation described in the sales section. */
const MONTE_CARLO_DRAWS = 5000;

function Block({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="panel min-w-0 scroll-mt-8 p-6 sm:p-8">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-5 max-w-[68ch] space-y-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A formula reads as a statement, set apart from the prose around it. */
const Formula = ({ children }: { children: ReactNode }) => (
  <p className="rounded-tile bg-surface-2/60 px-5 py-3 text-[15px] text-foreground">{children}</p>
);

/** Splits a template around one {placeholder} so a React node can sit in its place. */
function withNode(template: string, name: string, node: ReactNode): ReactNode {
  const [before, after = ""] = template.split(`{${name}}`);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

export default async function MethodologyPage() {
  const locale = await getLocale();
  const [m, common] = await Promise.all([getMessages("methodology", locale), getMessages("common", locale)]);
  const pct = (v: number) => formatPct(v, locale);
  const sections = SECTIONS.map((s) => ({ id: s.id, label: m.sections[s.key] }));
  const titleOf = (id: SectionId) => sections.find((s) => s.id === id)?.label ?? "";
  const thresholds = {
    prioritizeScore: DECISION_THRESHOLDS.prioritizeScore,
    prioritizeConfidence: pct(DECISION_THRESHOLDS.prioritizeConfidence),
    testScore: DECISION_THRESHOLDS.testScore,
    minConfidence: pct(DECISION_THRESHOLDS.minConfidence),
  };
  const maxWeight = Math.max(...DEFAULT_CRITERIA.map((c) => CRITERION_WEIGHTS[c.id]));
  const totalWeight = DEFAULT_CRITERIA.reduce((s, c) => s + CRITERION_WEIGHTS[c.id], 0);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{t(m.intro, { version: SCORING_MODEL_VERSION })}</p>
      </header>

      <div className="mt-12 grid gap-10 min-[900px]:grid-cols-[13rem_minmax(0,1fr)] min-[900px]:gap-12">
        <aside className="hidden min-[900px]:block">
          <div className="sticky top-8">
            <SectionNav items={sections} label={m.tocLabel} />
          </div>
        </aside>

        <div className="animate-enter min-w-0 space-y-4" style={{ "--stagger": 1 } as React.CSSProperties}>
          <Block id="valeurs" title={titleOf("valeurs")}>
            <p>{m.values.body}</p>
            <EpistemicLegend className="mt-4 max-w-md" />
          </Block>

          <Block id="demande" title={titleOf("demande")}>
            <p>{m.demand.sources}</p>
            <Formula>{m.demand.formula}</Formula>
            <p>
              {t(m.demand.limits, {
                trendMonths: FORECAST_PARAMS.minMonthsForTrend,
                seasonMonths: FORECAST_PARAMS.minMonthsForSeasonality,
              })}
            </p>
          </Block>

          <Block id="ventes" title={titleOf("ventes")}>
            <Formula>{m.sales.formula}</Formula>
            <p>{t(m.sales.body, { draws: formatInt(MONTE_CARLO_DRAWS, locale) })}</p>
          </Block>

          <Block id="publicite" title={titleOf("publicite")}>
            <Formula>{m.ads.formula}</Formula>
            <p>{m.ads.body}</p>
          </Block>

          <Block id="score" title={titleOf("score")}>
            <p>{t(m.score.intro, { count: DEFAULT_CRITERIA.length, total: totalWeight })}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-tile bg-surface-2">
              {DEFAULT_CRITERIA.map((c, i) => (
                <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_4rem_3.5rem] items-center gap-4 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_3.5rem]">
                  <span className="text-foreground">{m.criteria[c.id]}</span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-pill bg-background">
                    <span
                      className="animate-bar block h-full rounded-full bg-foreground"
                      style={{ width: `${(CRITERION_WEIGHTS[c.id] / maxWeight) * 100}%`, "--stagger": i } as React.CSSProperties}
                    />
                  </span>
                  <span className="text-right text-foreground">
                    <span className="tabular">{CRITERION_WEIGHTS[c.id]}</span> {m.score.pointsUnit}
                  </span>
                </li>
              ))}
            </ul>
            <p>
              {t(m.score.rules, {
                coverage: pct(Math.round(SCORING_POLICY.minCoverage * 100)),
                cap: SCORING_POLICY.negativeEconomicsCap,
              })}
            </p>
          </Block>

          <Block id="confiance" title={titleOf("confiance")}>
            <Formula>{m.confidence.formula}</Formula>
            <p>{t(m.confidence.body, thresholds)}</p>
            <DecisionZones t={DECISION_THRESHOLDS} decisions={m.decisions} caption={m.zones.caption} />
          </Block>

          <Block id="verdict" title={titleOf("verdict")}>
            <p>{withNode(m.verdict.intro, "rule", <code className="text-foreground">verdict_v1</code>)}</p>
            <div className="rounded-tile bg-surface-2 py-2 max-sm:bg-transparent max-sm:py-0">
              <VerdictTable thresholds={thresholds} m={m.verdict} words={common.verdict} />
            </div>
            <p>{m.verdict.blockingIntro}</p>
            <ul className="list-disc space-y-1.5 pl-5 marker:text-line">
              <li>{m.verdict.blocking.loss}</li>
              <li>{m.verdict.blocking.belowMinimum}</li>
              <li>{m.verdict.blocking.noDemand}</li>
            </ul>
            <p>{m.verdict.unknownMargin}</p>
          </Block>

          <Block id="ia" title={titleOf("ia")}>
            <p>{m.ai.intro}</p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-tile bg-surface-2 px-5 py-4">
                <dt className="text-xs">{m.ai.model}</dt>
                <dd className="mt-1 text-foreground">{LOCAL_AI_MODEL_INFO.name}</dd>
              </div>
              <div className="rounded-tile bg-surface-2 px-5 py-4">
                <dt className="text-xs">{m.ai.license}</dt>
                <dd className="mt-1 text-foreground">{LOCAL_AI_MODEL_INFO.license}</dd>
              </div>
            </dl>
            <p>{m.ai.runsLocally}</p>
            <p>{m.ai.checks}</p>
          </Block>
        </div>
      </div>
    </div>
  );
}
