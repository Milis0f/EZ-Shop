"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cancelRun, followRun } from "@/components/research/follow-run";
import { stepLabel } from "@/components/research/deep-research";
import { Button } from "@/components/ui/button";
import { DEEP_STEPS, type DeepStep } from "@/domain/deep-research";
import type { RunView } from "@/domain/history";
import { useFormat, useMessages } from "@/i18n/client";

const isDeepStep = (step: string): step is DeepStep => (DEEP_STEPS as readonly string[]).includes(step);

/** A run still waiting or working, followed live; the page reloads with its report once it is over. */
export function LiveRun({ id }: { readonly id: string }) {
  const m = useMessages("deepResearch");
  const f = useFormat();
  const router = useRouter();
  const [view, setView] = useState<RunView | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    void followRun(id, abort.signal, setView).then((last) => {
      if (last && !abort.signal.aborted) router.refresh();
    });
    return () => abort.abort();
  }, [id, router]);

  const step = view?.status === "pending" ? m.queue.waiting : view?.step && isDeepStep(view.step.step) ? stepLabel({ type: "step", step: view.step.step, progress: view.progress ?? 0, detail: view.step.detail }, m.steps) : m.form.pending;
  const share = view?.progress ?? 0;
  return (
    <div className="rounded-tile border border-line px-6 py-6">
      <p role="status" aria-live="polite" className="font-mono text-sm">
        {f.number(share * 100, { maximumFractionDigits: 0 })} % · {step}
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-pill bg-secondary" aria-hidden>
        <div className="h-full bg-foreground transition-[width] duration-500" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{m.queue.leave}</p>
      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => void cancelRun(id)}>
        {m.queue.cancel}
      </Button>
    </div>
  );
}

/** Starts the same deep research again (after a stop, a failure or an interruption) and follows it. */
export function RetryRun({ params }: { readonly params: unknown }) {
  const m = useMessages("history");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const response = await fetch("/api/research/deep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) });
      const id = response.ok ? ((await response.json()) as { data?: { id?: unknown } }).data?.id : undefined;
      if (typeof id === "string") router.push(`/analyse/ia?run=${id}`);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void retry()}>
        {m.run.retry}
      </Button>
      {failed && <span className="text-xs text-muted-foreground">{m.removeFailed}</span>}
    </span>
  );
}
