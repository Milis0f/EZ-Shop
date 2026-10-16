import Link from "next/link";
import { isKnown } from "@/domain/datum";
import { PROVIDER_IDS } from "@/domain/provenance";
import type { ConfidenceAssessment, ScoredCountry } from "@/domain/scoring";
import { CONFIDENCE_LABELS, formatDecimal, missingLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const stagger = (i: number) => ({ "--stagger": i }) as React.CSSProperties;

/** Sources whose connection would back the most missing score weight, heaviest first. */
function sourcesToUnlock(scoring: ScoredCountry): Array<{ id: string; weight: number }> {
  const byProvider = new Map<string, number>();
  for (const c of scoring.criteria) {
    if (c.status === "scored") continue;
    for (const id of new Set(c.missing.filter((m) => (PROVIDER_IDS as readonly string[]).includes(m)))) {
      byProvider.set(id, (byProvider.get(id) ?? 0) + c.weight);
    }
  }
  return [...byProvider.entries()].map(([id, weight]) => ({ id, weight })).toSorted((a, b) => b.weight - a.weight).slice(0, 3);
}

/** Each criterion: weight, contribution and the raw value behind it — or why it could not be scored. */
export function CriteriaBreakdown({ scoring }: { scoring: ScoredCountry }) {
  const score = scoring.score;
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line px-6 py-4 text-sm">
        {isKnown(score) ? (
          <p className="text-muted-foreground">
            Score <span className="font-medium text-foreground">{formatDecimal(score.value.total)}/100</span>, calculé sur{" "}
            {Math.round(score.value.coverage * 100)} % du poids total.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">Score non calculé : {score.reason}</p>
            {sourcesToUnlock(scoring).length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Sources qui couvriraient le plus de poids :{" "}
                {sourcesToUnlock(scoring)
                  .map((s) => `${missingLabel(s.id)} (+${s.weight} pts)`)
                  .join(", ")}
                .{" "}
                <Link href="/connectors" className="font-medium text-foreground underline-offset-4 hover:underline">
                  Les brancher
                </Link>
              </p>
            )}
          </>
        )}
        {isKnown(score) && score.value.cap && (
          <p className="mt-2 flex items-start gap-2 text-decision-avoid">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
            Plafonné à {score.value.cap.cap} : {score.value.cap.reason}
          </p>
        )}
      </div>
      <ul className="divide-y divide-line">
        {scoring.criteria.map((c, i) => {
          const scored = c.status === "scored";
          return (
            <li
              key={c.id}
              className="grid gap-x-8 gap-y-2 px-6 py-5 transition-colors duration-[var(--dur-fast)] hover:bg-surface-2/50 md:grid-cols-[minmax(11rem,15rem)_10rem_1fr]"
            >
              <span className="font-medium">
                {c.label}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{c.weight} pts max</span>
              </span>
              <span className="flex items-center gap-3">
                <span aria-hidden className={cn("relative h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-2", !scored && "hatch")}>
                  {scored && (
                    <span
                      className="animate-bar absolute inset-y-0 left-0 rounded-full bg-foreground"
                      style={{ width: `${(c.normalized ?? 0) * 100}%`, ...stagger(i) }}
                    />
                  )}
                </span>
                <span className={scored ? "font-medium" : "text-xs text-muted-foreground"}>{scored ? formatDecimal(c.points ?? 0) : "insuffisant"}</span>
              </span>
              <span className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {c.rawLabel && <span className="mr-1.5 text-foreground">{c.rawLabel}.</span>}
                {c.explanation}
                {!scored && c.missing.length > 0 && <span className="mt-1 block text-xs">Manque : {c.missing.map(missingLabel).join(", ")}.</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Four factors side by side: the product of them is the confidence, so the weakest one stands out. */
export function ConfidencePanel({ confidence }: { confidence: ConfidenceAssessment }) {
  const weakest = confidence.factors.reduce((min, f) => (f.value < min.value ? f : min), confidence.factors[0]);
  return (
    <div className="panel overflow-hidden">
      <p className="border-b border-line px-6 py-4 text-sm text-muted-foreground">
        Confiance <span className="font-medium text-foreground">{confidence.score} %</span>, niveau{" "}
        {CONFIDENCE_LABELS[confidence.level].toLowerCase()}. Produit des quatre facteurs : un seul facteur faible suffit à la faire
        chuter.
      </p>
      <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {confidence.factors.map((f, i) => (
          <div key={f.id} className="bg-surface px-6 py-5">
            <dt className="flex items-baseline justify-between gap-3 text-sm">
              <span>{f.label}</span>
              {f.id === weakest?.id && f.value < 1 && confidence.factors.length > 1 && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">le plus faible</span>
              )}
            </dt>
            <dd className="mt-3 text-2xl font-semibold tracking-tight tabular">
              {Math.round(f.value * 100)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>
            </dd>
            <dd aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="animate-bar h-full rounded-full bg-muted-foreground/60" style={{ width: `${f.value * 100}%`, ...stagger(i) }} />
            </dd>
            <dd className="mt-3 text-xs leading-relaxed text-muted-foreground">{f.explanation}</dd>
          </div>
        ))}
      </dl>
      {confidence.mockTainted && (
        <p className="border-t border-line px-6 py-3 text-xs text-kind-mock">Calculée sur des données fictives : sans valeur réelle.</p>
      )}
    </div>
  );
}
