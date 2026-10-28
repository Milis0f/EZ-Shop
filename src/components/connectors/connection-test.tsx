"use client";

import { CircleCheck, CircleDashed, CircleX, PlugZap } from "lucide-react";
import { useState, useTransition } from "react";
import { testConnectorConnection } from "@/app/connectors/actions";
import type { ConnectorTestResult } from "@/app/connectors/form-state";
import type { ProviderId } from "@/domain/provenance";
import type { ConnectionCheckStep } from "@/providers/contracts";
import { RingLoader } from "@/components/motion/ring-loader";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";

const ICONS: Record<ConnectionCheckStep["status"], { icon: typeof CircleCheck; tone: string }> = {
  ok: { icon: CircleCheck, tone: "text-kind-observed" },
  error: { icon: CircleX, tone: "text-foreground" },
  skipped: { icon: CircleDashed, tone: "text-muted-foreground" },
};

/** Runs the saved credentials against the real API and lists each step with what to fix. */
export function ConnectionTest({ providerId }: { providerId: ProviderId }) {
  const [result, setResult] = useState<ConnectorTestResult | null>(null);
  const [pending, startTransition] = useTransition();
  const m = useMessages("connectors").test;

  const run = () =>
    startTransition(async () => {
      try {
        setResult(await testConnectorConnection(providerId));
      } catch {
        setResult({ ok: false, message: m.launchFailed });
      }
    });

  const passed = result?.ok === true && result.steps.every((s) => s.status === "ok");

  return (
    <section aria-label={m.label} className={cn("rounded-tile border p-4", passed ? "border-foreground/30" : "border-line")}>
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 text-xs text-muted-foreground">
          {passed ? m.passed : m.hint}
        </p>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          aria-busy={pending || undefined}
          className="interactive inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium whitespace-nowrap hover:bg-surface-2 disabled:opacity-60"
        >
          {pending ? <RingLoader size="sm" /> : <PlugZap className="size-3.5" strokeWidth={1.5} aria-hidden />}
          {pending ? m.running : result ? m.rerun : m.run}
        </button>
      </div>

      <div aria-live="polite">
        {!pending && result && !result.ok && <p className="animate-slide-down mt-4 text-sm text-foreground">{result.message}</p>}
        {!pending && result?.ok && (
          <ol className="mt-4 space-y-3">
            {result.steps.map((step, i) => {
              const { icon: Icon, tone } = ICONS[step.status];
              const label = m.step[step.status];
              return (
                <li key={step.id} className="animate-enter flex gap-3" style={{ "--stagger": i } as React.CSSProperties}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-label={label} />
                  <div className="min-w-0 text-sm">
                    <p className={cn("font-medium", step.status === "skipped" && "text-muted-foreground")}>{step.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                    {step.items && (
                      <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
                        {step.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
