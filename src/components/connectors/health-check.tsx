"use client";

import { useState, useTransition } from "react";
import { testSourceHealth } from "@/app/connectors/actions";
import { Button } from "@/components/ui/button";
import type { HealthResult } from "@/providers/health-probes";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";

/** The last real test of a source on this computer, and a button to run one now. */
export function HealthCheck({ providerId, last }: { readonly providerId: string; readonly last: HealthResult | null }) {
  const m = useMessages("connectors").health;
  const f = useFormat();
  const [result, setResult] = useState<HealthResult | null>(last);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function test() {
    setNote(null);
    startTransition(async () => {
      const answer = await testSourceHealth(providerId);
      if (answer.ok) setResult(answer.result);
      else setNote(answer.reason === "remote" ? m.remote : answer.reason === "too_many" ? m.tooMany : m.unknown);
    });
  }

  const line = !result
    ? m.never
    : t(m[result.outcome], { date: f.date(result.testedAt), ms: f.int(result.ms), code: result.code ?? "?" });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" aria-live="polite" className={result?.outcome === "failed" ? "text-foreground" : "text-muted-foreground"}>
        {note ?? line}
      </p>
      <Button type="button" size="xs" variant="outline" disabled={pending} onClick={test}>
        {pending ? m.testing : m.test}
      </Button>
    </div>
  );
}
