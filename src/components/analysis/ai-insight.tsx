"use client";

import { useEffect, useState } from "react";
import { AiAura, aiRevealClassName, type AiAuraState } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { CountryTag } from "@/components/data/country-tag";
import { KindMarker } from "@/components/data/kind-marker";
import { Button } from "@/components/ui/button";
import { aiInsightResponseSchema, type AiInsightResponse } from "@/domain/ai-insight";
import { COUNTRIES } from "@/domain/country";
import { formatDecimal } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReadyResponse = Extract<AiInsightResponse, { status: "ready" }>;

type Outcome =
  | { readonly kind: "response"; readonly response: AiInsightResponse }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "aborted" };

type View =
  | { readonly kind: "thinking" }
  | { readonly kind: "ready"; readonly result: ReadyResponse }
  | { readonly kind: "unavailable" | "rejected"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

function envelopeMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return null;
  const message = (error as { message: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : null;
}

/** One POST, validated at the boundary. Never rejects: every failure becomes an outcome. */
async function requestInsight(analysisId: string, signal: AbortSignal): Promise<Outcome> {
  try {
    const res = await fetch(`/api/analyses/${encodeURIComponent(analysisId)}/ai`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { kind: "error", message: envelopeMessage(body) ?? `le serveur a répondu ${res.status}.` };
    const data = typeof body === "object" && body !== null && "data" in body ? (body as { data: unknown }).data : undefined;
    const parsed = aiInsightResponseSchema.safeParse(data);
    return parsed.success ? { kind: "response", response: parsed.data } : { kind: "error", message: "réponse inattendue du serveur." };
  } catch {
    if (signal.aborted) return { kind: "aborted" };
    return { kind: "error", message: "le serveur ne répond pas." };
  }
}

interface Inflight {
  readonly promise: Promise<Outcome>;
  readonly controller: AbortController;
  users: number;
}

/**
 * The simple and advanced views of a page are both mounted (CSS hides one), so they share one request
 * per analysis instead of asking the model twice. The request is aborted once nobody listens any more.
 */
const inflight = new Map<string, Inflight>();

function subscribe(analysisId: string): { readonly promise: Promise<Outcome>; readonly release: () => void } {
  let entry = inflight.get(analysisId);
  if (!entry) {
    const controller = new AbortController();
    const created: Inflight = { controller, users: 0, promise: requestInsight(analysisId, controller.signal) };
    void created.promise.then(() => {
      if (inflight.get(analysisId) === created) inflight.delete(analysisId);
    });
    inflight.set(analysisId, created);
    entry = created;
  }
  const current = entry;
  current.users += 1;
  return {
    promise: current.promise,
    release: () => {
      current.users -= 1;
      // Deferred, so a Strict Mode remount keeps the request alive.
      window.setTimeout(() => {
        if (current.users > 0 || inflight.get(analysisId) !== current) return;
        inflight.delete(analysisId);
        current.controller.abort();
      }, 0);
    },
  };
}

function toView(outcome: Exclude<Outcome, { kind: "aborted" }>): View {
  if (outcome.kind === "error") return outcome;
  const r = outcome.response;
  return r.status === "ready" ? { kind: "ready", result: r } : { kind: r.status, reason: r.reason };
}

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

const stagger = (order: number) => ({ "--stagger": order }) as React.CSSProperties;

function Reading({ result }: { result: ReadyResponse }) {
  const { insight, model } = result;
  const timing = result.cached ? "(déjà prêt)" : `(en ${formatDecimal(result.durationMs / 1000)} s)`;
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
          <span className="font-medium">{insight.productReading.category}</span> : {insight.productReading.description}
        </p>
      </div>

      {insight.countries.length > 0 && (
        <ul style={stagger(2)} className={cn(aiRevealClassName, "mt-5 divide-y divide-line border-y border-line")}>
          {insight.countries.map((line) => (
            <li key={line.country} className="flex gap-3 py-3 text-sm leading-relaxed">
              <CountryTag code={line.country} className="mt-1" />
              <p className="min-w-0">
                <span className="font-medium">{COUNTRIES[line.country].nameFr}</span> : {line.sentence}
              </p>
            </li>
          ))}
        </ul>
      )}

      {insight.nextSteps.length > 0 && (
        <div style={stagger(3)} className={cn(aiRevealClassName, "mt-5")}>
          <p className="text-xs text-muted-foreground">Pour aller plus loin</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed">
            {insight.nextSteps.map((step) => (
              <li key={step} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.6em] size-1 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={stagger(4)} className={cn(aiRevealClassName, "mt-5 text-xs leading-relaxed text-muted-foreground")}>
        Rédigé par <span title={`Licence ${model.license}`}>{model.name}</span> sur ton ordinateur, à partir des seules données de cette
        analyse. Chaque chiffre a été vérifié. {timing}
      </p>
    </>
  );
}

const AURA_STATE: Record<View["kind"], AiAuraState> = {
  thinking: "thinking",
  ready: "ready",
  unavailable: "off",
  rejected: "off",
  error: "off",
};

function statusText(view: View): string {
  switch (view.kind) {
    case "thinking":
      return "L'IA locale lit cette analyse";
    case "ready":
      return "Lecture de l'IA locale prête.";
    case "unavailable":
      return `IA locale indisponible : ${view.reason}`;
    case "rejected":
      return `Texte de l'IA écarté : ${view.reason}`;
    case "error":
      return `Lecture par l'IA impossible : ${view.message}`;
  }
}

/**
 * The local AI's reading of a stored analysis, inside the aura. It only rewords the analysis (the server
 * checks every number); the product reading is a hypothesis. When the AI cannot run, it says so.
 */
export function AiInsight({ analysisId, className }: { analysisId: string; className?: string }) {
  const [view, setView] = useState<View>({ kind: "thinking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    const { promise, release } = subscribe(analysisId);
    void promise.then((outcome) => {
      if (live && outcome.kind !== "aborted") setView(toView(outcome));
    });
    return () => {
      live = false;
      release();
    };
  }, [analysisId, attempt]);

  const retry = () => {
    setView({ kind: "thinking" });
    setAttempt((n) => n + 1);
  };

  const thinking = view.kind === "thinking";
  const auraState = AURA_STATE[view.kind];

  return (
    <AiAura state={auraState} aria-busy={thinking} className={className} surfaceClassName="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <AiBadge state={auraState} />
        {thinking && <Elapsed key={attempt} />}
      </div>

      <div aria-live="polite" aria-atomic="true">
        <p className={cn("mt-4 text-sm", view.kind === "ready" ? "sr-only" : view.kind === "thinking" ? "text-foreground" : "text-muted-foreground")}>
          {statusText(view)}
        </p>
      </div>

      {thinking && (
        <>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            La première lecture peut prendre une minute : le modèle se charge sur ton ordinateur.
          </p>
          <div aria-hidden className="mt-5 space-y-2.5">
            <div className="skeleton-shimmer h-2.5 w-11/12 rounded-pill" />
            <div className="skeleton-shimmer h-2.5 w-3/4 rounded-pill" />
            <div className="skeleton-shimmer h-2.5 w-1/2 rounded-pill" />
          </div>
        </>
      )}

      {view.kind === "ready" && <Reading result={view.result} />}

      {view.kind === "error" && (
        <Button type="button" variant="outline" size="sm" onClick={retry} className="mt-4">
          Réessayer
        </Button>
      )}
    </AiAura>
  );
}
