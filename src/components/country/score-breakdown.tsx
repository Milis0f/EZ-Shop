import Link from "next/link";
import { isKnown } from "@/domain/datum";
import { PROVIDER_IDS } from "@/domain/provenance";
import type { ConfidenceAssessment, ScoredCountry } from "@/domain/scoring";
import { advancedMessages, missingLabel, rich } from "@/components/data/labels";
import { criterionLabel, factorLabel } from "@/engine/report/localize";
import type { Locale } from "@/i18n/config";
import { formatDecimal, formatPct } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { engineText } from "@/components/data/engine-text";

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
export function CriteriaBreakdown({ scoring, locale }: { scoring: ScoredCountry; locale: Locale }) {
  const m = advancedMessages(locale).breakdown;
  const score = scoring.score;
  const unlock = sourcesToUnlock(scoring);
  return (
    <div className="panel min-w-0 p-2">
      <div className="px-4 pt-3.5 pb-4 text-sm sm:px-[18px]">
        {isKnown(score) ? (
          <p className="text-muted-foreground">
            {rich(m.score, {
              score: <span className="tabular font-medium text-foreground">{formatDecimal(score.value.total, locale)}/100</span>,
              coverage: formatPct(Math.round(score.value.coverage * 100), locale),
            })}
          </p>
        ) : (
          <>
            <p className="text-muted-foreground">{t(m.notScored, { reason: engineText(score.reason, locale) })}</p>
            {unlock.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {m.unlock} {unlock.map((s) => t(m.points, { source: missingLabel(s.id, locale), weight: s.weight })).join(", ")}.{" "}
                <Link href="/connectors" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {m.connect}
                </Link>
              </p>
            )}
          </>
        )}
        {isKnown(score) && score.value.cap && (
          <p className="mt-2 flex items-start gap-2 text-foreground">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
            {t(m.capped, { cap: score.value.cap.cap, reason: engineText(score.value.cap.reason, locale) })}
          </p>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {scoring.criteria.map((c, i) => {
          const scored = c.status === "scored";
          return (
            <li
              key={c.id}
              className="grid gap-x-8 gap-y-2.5 rounded-tile bg-surface-2/40 px-4 py-4 sm:px-[18px] md:grid-cols-[minmax(11rem,15rem)_11rem_1fr]"
            >
              <span className="font-medium">
                {criterionLabel(c, locale)}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{t(m.maxPoints, { weight: c.weight })}</span>
              </span>
              <span className="flex items-center gap-3">
                <span aria-hidden className={cn("relative h-2.5 w-24 shrink-0 overflow-hidden rounded-pill bg-surface-2", !scored && "hatch")}>
                  {scored && (
                    <span
                      className="animate-bar absolute inset-y-0 left-0 rounded-pill bg-foreground"
                      style={{ width: `${(c.normalized ?? 0) * 100}%`, ...stagger(i) }}
                    />
                  )}
                </span>
                <span className={scored ? "tabular font-medium" : "text-xs text-muted-foreground"}>{scored ? formatDecimal(c.points ?? 0, locale) : m.insufficient}</span>
              </span>
              <span className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {c.rawLabel && <span className="mr-1.5 text-foreground">{engineText(c.rawLabel, locale)}.</span>}
                {engineText(c.explanation, locale)}
                {!scored && c.missing.length > 0 && <span className="mt-1 block text-xs">{t(m.missing, { list: c.missing.map((k) => missingLabel(k, locale)).join(", ") })}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Four factors side by side: the product of them is the confidence, so the weakest one stands out. */
export function ConfidencePanel({ confidence, locale }: { confidence: ConfidenceAssessment; locale: Locale }) {
  const all = advancedMessages(locale);
  const m = all.breakdown;
  const weakest = confidence.factors.reduce((min, f) => (f.value < min.value ? f : min), confidence.factors[0]);
  return (
    <div className="panel min-w-0 p-2">
      <p className="px-4 pt-3.5 pb-4 text-sm text-muted-foreground sm:px-[18px]">
        {rich(m.confidence, {
          score: <span className="tabular font-medium text-foreground">{formatPct(confidence.score, locale)}</span>,
          level: all.labels.confidence[confidence.level].toLocaleLowerCase(),
        })}
      </p>
      <dl className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {confidence.factors.map((f, i) => (
          <div key={f.id} className="rounded-tile bg-surface-2/40 px-4 py-4 sm:px-[18px]">
            <dt className="flex items-baseline justify-between gap-3 text-sm">
              <span>{factorLabel(f, locale)}</span>
              {f.id === weakest?.id && f.value < 1 && confidence.factors.length > 1 && (
                <span className="shrink-0 rounded-pill border border-line px-2.5 py-0.5 text-[11px] text-muted-foreground">{m.weakest}</span>
              )}
            </dt>
            <dd className="mt-3 text-2xl font-semibold tracking-tight tabular">
              {Math.round(f.value * 100)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">%</span>
            </dd>
            <dd aria-hidden className="mt-2 h-2.5 overflow-hidden rounded-pill bg-surface-2">
              <div className="animate-bar h-full rounded-pill bg-muted-foreground/60" style={{ width: `${f.value * 100}%`, ...stagger(i) }} />
            </dd>
            <dd className="mt-3 text-xs leading-relaxed text-muted-foreground">{engineText(f.explanation, locale)}</dd>
          </div>
        ))}
      </dl>
      {confidence.mockTainted && (
        <p className="px-4 pt-3 pb-1.5 text-xs text-kind-mock sm:px-[18px]">{m.mockTainted}</p>
      )}
    </div>
  );
}
