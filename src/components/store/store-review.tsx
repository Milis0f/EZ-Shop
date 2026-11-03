"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { reviewMyStore } from "@/app/store/actions";
import { AiAura, aiRevealClassName } from "@/components/ai/ai-aura";
import { useAiInstall } from "@/components/ai/ai-install-store";
import { Button } from "@/components/ui/button";
import type { ReviewResult, StoreReview } from "@/domain/store";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { Panel } from "./store-traffic";

const stagger = (order: number) => ({ "--stagger": order }) as React.CSSProperties;

/** The local AI's advice on the store, written on request from the store's own figures. */
export function StoreReviewPanel() {
  const m = useMessages("storeLive").review;
  const ai = useAiInstall();
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [pending, startTransition] = useTransition();
  const aiReady = ai === null || ai.state === "installed";

  function ask() {
    startTransition(async () => {
      setResult(await reviewMyStore());
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel bar="ia — avis" title={m.title}>
        <p className="-mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{m.intro}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button type="button" disabled={pending || !aiReady} onClick={ask} className="h-11 px-6">
            {pending ? m.pending : result?.ok ? m.again : m.ask}
          </Button>
          {pending && <p className="text-xs text-muted-foreground">{m.pendingNote}</p>}
          {!aiReady && (
            <p className="text-sm text-muted-foreground">
              {m.needsAi}{" "}
              <Link href="/settings#ai" className="font-medium text-foreground underline decoration-line underline-offset-4 hover:decoration-foreground">
                {m.needsAiLink}
              </Link>
            </p>
          )}
        </div>
        {result && !result.ok && !pending && (
          <p role="alert" className="mt-5 text-sm text-muted-foreground">
            {m.failures[result.code]}
          </p>
        )}
      </Panel>

      {pending && (
        <AiAura state="thinking" aria-busy surfaceClassName="p-5 sm:p-7">
          <p className="text-sm text-muted-foreground">{m.pending}</p>
        </AiAura>
      )}
      {!pending && result?.ok && <ReviewView review={result.review} />}
    </div>
  );
}

function ReviewView({ review }: { readonly review: StoreReview }) {
  const m = useMessages("storeLive").review;
  const f = useFormat();
  const used = (["sales", "traffic", "meta", "google"] as const).map((key) => ({ key, label: m.sources[key], on: review.used[key] }));
  return (
    <AiAura state="ready" surfaceClassName="flex flex-col gap-7 p-5 sm:p-8">
      {review.headline && (
        <p style={stagger(0)} className={cn(aiRevealClassName, "max-w-3xl font-display text-xl leading-snug tracking-[-0.02em] sm:text-2xl")}>
          {review.headline}
        </p>
      )}

      {review.actions.length > 0 && (
        <section style={stagger(1)} className={aiRevealClassName}>
          <h3 className="mb-3 text-sm font-medium">{m.actions}</h3>
          <ol className="grid gap-3 min-[900px]:grid-cols-2">
            {review.actions.map((action, i) => (
              <li key={`${action.title}-${i}`} className="flex flex-col gap-2 rounded-tile border border-line bg-[var(--surface-2)] p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-pill border px-2 py-0.5 font-mono tracking-[-0.02em]" data-priority={action.priority} style={{ borderColor: priorityColor(action.priority), color: priorityColor(action.priority) }}>
                    {m.priorities[action.priority]}
                  </span>
                  <span className="text-muted-foreground">{m.areas[action.area]}</span>
                </div>
                <p className="font-medium leading-snug">{action.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{action.why}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div style={stagger(2)} className={cn(aiRevealClassName, "grid gap-6 min-[900px]:grid-cols-2")}>
        {review.problems.length > 0 && <ReviewList title={m.problems} lines={review.problems} />}
        {review.strengths.length > 0 && <ReviewList title={m.strengths} lines={review.strengths} />}
      </div>

      <footer style={stagger(3)} className={cn(aiRevealClassName, "flex flex-col gap-2 border-t border-line pt-4 text-xs text-muted-foreground")}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t(m.used, { model: review.model, date: f.date(review.writtenAt) })}</span>
          {used.map((source) => (
            <span key={source.key} className={source.on ? "text-foreground" : "line-through decoration-line"} title={source.on ? undefined : m.missing}>
              {source.label}
            </span>
          ))}
        </p>
        <p>{m.caution}</p>
      </footer>
    </AiAura>
  );
}

function ReviewList({ title, lines }: { readonly title: string; readonly lines: readonly string[] }) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <ul className="flex flex-col gap-2 text-sm leading-relaxed">
        {lines.map((line) => (
          <li key={line} className="flex gap-3">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--ink-muted)]" />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

function priorityColor(priority: StoreReview["actions"][number]["priority"]): string {
  return priority === "high" ? "var(--verdict-non)" : priority === "medium" ? "var(--verdict-surveiller)" : "var(--ink-muted)";
}
