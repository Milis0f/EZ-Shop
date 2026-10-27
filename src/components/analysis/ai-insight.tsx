"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AiAura, aiRevealClassName, type AiAuraState } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { getInsightView, INITIAL_VIEW, retryInsight, subscribeInsight, type InsightView, type ReadyResponse } from "@/components/ai/ai-insight-store";
import { groupCountryLines, lowerFirst, VISIBLE_COUNTRY_GROUPS, type CountryLineGroup } from "@/components/ai/ai-reading";
import { CountryTag } from "@/components/data/country-tag";
import { KindMarker } from "@/components/data/kind-marker";
import { Expand } from "@/components/motion/expand";
import { Button } from "@/components/ui/button";
import { COUNTRIES } from "@/domain/country";
import { formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A cached reading answers in a few tens of ms: the waiting hint only shows past this delay. */
const THINKING_HINT_DELAY_MS = 300;

/** Real seconds since the AI started reading. */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 250);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular text-xs text-muted-foreground">{seconds} s</span>;
}

function useDelayed(ms: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(id);
  }, [ms]);
  return shown;
}

const stagger = (order: number) => ({ "--stagger": order }) as CSSProperties;

const countryNames = (codes: readonly string[]): string => codes.map((code) => COUNTRIES[code as keyof typeof COUNTRIES].nameFr).join(", ");

function CountryLine({ group }: { group: CountryLineGroup }) {
  return (
    <li className="flex flex-col gap-1.5 py-3 text-sm leading-relaxed sm:flex-row sm:gap-3">
      <span className="flex shrink-0 flex-wrap gap-1 sm:mt-1 sm:max-w-36">
        {group.countries.map((code) => (
          <CountryTag key={code} code={code} />
        ))}
      </span>
      <p className="min-w-0">
        <span className="font-medium">{countryNames(group.countries)}</span> : {group.sentence}
      </p>
    </li>
  );
}

function CountryLines({ lines }: { lines: ReadyResponse["insight"]["countries"] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const groups = groupCountryLines(lines);
  const shown = groups.slice(0, VISIBLE_COUNTRY_GROUPS);
  const rest = groups.slice(VISIBLE_COUNTRY_GROUPS);
  const restCount = rest.reduce((n, g) => n + g.countries.length, 0);

  return (
    <div style={stagger(2)} className={cn(aiRevealClassName, "mt-5")}>
      <ul className="divide-y divide-line border-t border-line">
        {shown.map((group) => (
          <CountryLine key={group.countries.join("-")} group={group} />
        ))}
      </ul>
      {rest.length > 0 && (
        <>
          <Expand open={open} id={panelId}>
            <ul className="divide-y divide-line border-t border-line">
              {rest.map((group) => (
                <CountryLine key={group.countries.join("-")} group={group} />
              ))}
            </ul>
          </Expand>
          <div className="border-t border-line pt-3">
            <Button type="button" variant="ghost" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} className="-ml-3">
              {open ? "Masquer les autres pays" : `Voir les ${restCount} autres pays`}
            </Button>
          </div>
        </>
      )}
      {rest.length === 0 && <div className="border-t border-line" />}
    </div>
  );
}

function Reading({ result }: { result: ReadyResponse }) {
  const { insight, model, missingCountries } = result;
  const timing = result.cached ? "Lecture gardée en mémoire." : `Lu en ${formatDecimal(result.durationMs / 1000)} s.`;
  return (
    <>
      <p style={stagger(0)} className={cn(aiRevealClassName, "mt-4 text-[15px] leading-relaxed text-foreground")}>
        {insight.summary}
      </p>

      <div style={stagger(1)} className={cn(aiRevealClassName, "mt-5 rounded-[14px] border border-dashed border-line px-4 py-3")}>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Ce que c&apos;est, probablement
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-2 py-0.5 text-[11px]">
            <KindMarker kind="assumption" />
            Hypothèse lue dans le nom du produit
          </span>
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">
          <span className="font-medium">{insight.productReading.category}</span> : {lowerFirst(insight.productReading.description)}
        </p>
      </div>

      {insight.countries.length > 0 && <CountryLines lines={insight.countries} />}
      {missingCountries.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Pas de phrase de l&apos;IA pour : {countryNames(missingCountries)}.</p>
      )}

      {insight.nextSteps.length > 0 && (
        <div style={stagger(3)} className={cn(aiRevealClassName, "mt-5")}>
          <p className="text-xs text-muted-foreground">Pour aller plus loin</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
            {insight.nextSteps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={stagger(4)} className={cn(aiRevealClassName, "mt-5 text-xs leading-relaxed text-muted-foreground")}>
        Rédigé par <span title={`Licence ${model.license}`}>{model.name}</span> sur ton ordinateur, à partir des seules données de cette
        analyse. Chaque nombre cité figure dans les données de l&apos;analyse ; l&apos;IA peut se tromper sur leur sens. {timing}
      </p>
    </>
  );
}

function Thinking() {
  const shown = useDelayed(THINKING_HINT_DELAY_MS);
  if (!shown) return null;
  return (
    <>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">La première lecture peut prendre une minute : le modèle se charge sur ton ordinateur.</p>
      <div aria-hidden className="mt-5 space-y-2.5">
        <div className="skeleton-shimmer h-2.5 w-11/12 rounded-pill" />
        <div className="skeleton-shimmer h-2.5 w-3/4 rounded-pill" />
        <div className="skeleton-shimmer h-2.5 w-1/2 rounded-pill" />
      </div>
    </>
  );
}

function DelayedElapsed() {
  return useDelayed(THINKING_HINT_DELAY_MS) ? <Elapsed /> : null;
}

const AURA_STATE: Record<InsightView["kind"], AiAuraState> = {
  thinking: "thinking",
  ready: "ready",
  unavailable: "off",
  rejected: "off",
  error: "off",
};

function statusText(view: InsightView): string {
  switch (view.kind) {
    case "thinking":
      return "L'IA locale lit cette analyse";
    case "ready":
      return "Lecture de l'IA locale prête.";
    case "unavailable":
      return `IA locale indisponible. ${view.reason}`;
    case "rejected":
      return `Texte de l'IA écarté. ${view.reason}`;
    case "error":
      return `Lecture par l'IA impossible : ${view.message}`;
  }
}

/**
 * The local AI's reading of a stored analysis, inside the aura. It only rewords the analysis (the server
 * checks that every number it cites is among the analysis's values); the product reading is a hypothesis.
 * When the AI cannot run, it says so. Both views of the page share one state (see ai-insight-store).
 */
export function AiInsight({ analysisId, className }: { analysisId: string; className?: string }) {
  const subscribe = useCallback((listener: () => void) => subscribeInsight(analysisId, listener), [analysisId]);
  const view = useSyncExternalStore(subscribe, () => getInsightView(analysisId), () => INITIAL_VIEW);
  const auraRef = useRef<HTMLDivElement>(null);

  const retry = () => {
    // The button unmounts with the error: the block keeps the focus.
    auraRef.current?.focus();
    retryInsight(analysisId);
  };

  const thinking = view.kind === "thinking";
  const auraState = AURA_STATE[view.kind];

  return (
    <AiAura ref={auraRef} tabIndex={-1} state={auraState} aria-busy={thinking} className={cn("outline-none focus-visible:outline-2 focus-visible:outline-offset-2", className)} surfaceClassName="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <AiBadge state={auraState} />
        {thinking && <DelayedElapsed key={view.attempt} />}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Reformulation de l&apos;analyse par l&apos;IA locale, pas une donnée.</p>

      <div aria-live="polite" aria-atomic="true">
        <p className={cn("mt-4 text-sm", view.kind === "ready" ? "sr-only" : thinking ? "text-foreground" : "text-muted-foreground")}>{statusText(view)}</p>
      </div>

      {thinking && <Thinking key={view.attempt} />}

      {view.kind === "ready" && <Reading result={view.result} />}

      {view.kind === "error" && (
        <Button type="button" variant="outline" onClick={retry} className="mt-4">
          Réessayer
        </Button>
      )}
    </AiAura>
  );
}
