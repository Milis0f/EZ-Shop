"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { endAnalysis, reportAnalysis, startAnalysis } from "@/components/planet/planet-store";
import { countryName } from "@/components/search/display-names";
import { TermBar } from "@/components/marketing/term";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRY_CODES, type CountryCode } from "@/domain/country";
import { DEEP_STEPS, deepReportSchema, type DeepEvent, type DeepReport, type DeepStep } from "@/domain/deep-research";
import { useLocale, useMessages } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import { DeepReportView } from "./deep-report";
import { cancelRun, followRun } from "./follow-run";

/** Usual length of a deep analysis, for the ring until the first real steps arrive. */
const EXPECTED_MS = 150_000;

type View = { readonly kind: "idle" } | { readonly kind: "running"; readonly runId: string | null } | { readonly kind: "done"; readonly report: DeepReport; readonly savedId: string | null } | { readonly kind: "failed"; readonly message: string };

type StepMessages = Messages<"deepResearch">["steps"];

/** What the planet writes for a step, in the visitor's language. */
export function stepLabel(event: Extract<DeepEvent, { type: "step" }>, m: StepMessages): string {
  const detail = event.detail ?? "";
  switch (event.step) {
    case "search":
      return m.search;
    case "read":
      return t(m.read, { detail });
    case "shops":
      return t(m.shops, { detail });
    case "suppliers":
      return m.suppliers;
    case "ai_tools": {
      if (!event.detail) return m.aiStart;
      if (event.detail === "loading") return m.aiLoading;
      const [tool, ...rest] = detail.split(":");
      const input = rest.join(":");
      if (tool === "search_web") return t(m.aiSearch, { detail: input });
      if (tool === "read_page") return t(m.aiRead, { detail: input });
      if (tool === "shop_catalogue") return t(m.aiShop, { detail: input });
      return m.aiMargin;
    }
    case "ai_write":
      return m.aiWrite;
    default:
      return m.done;
  }
}

const isDeepStep = (step: string): step is DeepStep => (DEEP_STEPS as readonly string[]).includes(step);

const parsePrice = (raw: string): number | undefined => {
  const value = Number(raw.replace(",", ".").trim());
  return raw.trim() && Number.isFinite(value) && value >= 0 ? value : undefined;
};

export function DeepResearch() {
  const m = useMessages("deepResearch");
  const locale = useLocale();
  const [product, setProduct] = useState("");
  const [country, setCountry] = useState<CountryCode>("FR");
  const [prices, setPrices] = useState({ selling: "", supplier: "", shipping: "" });
  const [view, setView] = useState<View>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const id = useId();

  /** Follows a queued run to its end: the planet shows its real steps, the report comes with it. */
  async function follow(runId: string, name: string, runCountries: readonly CountryCode[]) {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setView({ kind: "running", runId });
    startAnalysis({ product: name, countries: [...runCountries], message: m.form.pending, expectedMs: EXPECTED_MS, phases: [] });
    try {
      let named = runCountries.length > 0;
      const last = await followRun(runId, abort.signal, (v) => {
        // Followed again from its address: the planet takes the research's own name once it is known.
        if (!named) {
          named = true;
          startAnalysis({ product: v.title, countries: [], message: m.form.pending, expectedMs: EXPECTED_MS, phases: [] });
        }
        if (v.status === "pending") reportAnalysis({ progress: 0, step: m.queue.waiting });
        else if (v.step && isDeepStep(v.step.step)) reportAnalysis({ progress: v.progress ?? 0, step: stepLabel({ type: "step", step: v.step.step, progress: v.progress ?? 0, detail: v.step.detail }, m.steps) });
      });
      if (abort.signal.aborted) return;
      const report = last?.status === "completed" ? deepReportSchema.safeParse(last.result) : null;
      if (report?.success) {
        setView({ kind: "done", report: report.data, savedId: runId });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setView({ kind: "failed", message: failureMessage(last?.status ?? null, last?.error ?? null) });
      }
    } finally {
      if (!abort.signal.aborted) endAnalysis();
    }
  }

  function failureMessage(status: string | null, error: string | null): string {
    if (status === "cancelled") return m.queue.cancelled;
    if (status === "interrupted") return m.queue.interrupted;
    if (error && error in m.failures) return m.failures[error as keyof typeof m.failures];
    return m.failures.request;
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    const name = product.trim();
    if (name.length < 2 || view.kind === "running") return;
    setView({ kind: "running", runId: null });
    try {
      const response = await fetch("/api/research/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: name, country, sellingPrice: parsePrice(prices.selling), supplierPrice: parsePrice(prices.supplier), shippingCost: parsePrice(prices.shipping) }),
      });
      const runId = response.ok ? ((await response.json()) as { data?: { id?: unknown } }).data?.id : undefined;
      if (typeof runId !== "string") {
        setView({ kind: "failed", message: response.status === 429 ? m.failures.rate_limited : m.failures.request });
        return;
      }
      // The address keeps the run: a reload, or coming back later, follows it again.
      window.history.replaceState(null, "", `?run=${runId}`);
      await follow(runId, name, [country]);
    } catch {
      setView({ kind: "failed", message: m.failures.request });
    }
  }

  // Opened with ?run=… (a reload, or from the history while it runs): follow that run.
  useEffect(() => {
    const runId = new URLSearchParams(window.location.search).get("run");
    if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return;
    // Started from a timer, like a subscription: the effect itself sets no state.
    const timer = setTimeout(() => void follow(runId, m.queue.resumed, []), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the page stops following only: the research goes on in the background.
  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <>
      <form onSubmit={(event) => void run(event)} className="spot" aria-busy={view.kind === "running"}>
        <TermBar title="ez-shop — analyse ia" />
        <div className="flex flex-col gap-5 p-6 sm:p-9">
          <div className="grid gap-4 min-[700px]:grid-cols-[1fr_14rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-product`}>{m.form.product}</Label>
              <Input id={`${id}-product`} required minLength={2} maxLength={120} value={product} onChange={(e) => setProduct(e.target.value)} placeholder={m.form.productPlaceholder} className="h-11" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-country`}>{m.form.country}</Label>
              <select id={`${id}-country`} value={country} onChange={(e) => setCountry(e.target.value as CountryCode)} className="h-11 rounded-tile border border-line bg-surface px-3 text-sm">
                {COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {countryName(code, locale)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm text-muted-foreground">{m.form.prices}</legend>
            <div className="grid gap-3 min-[600px]:grid-cols-3">
              {(
                [
                  ["selling", m.form.sellingPrice],
                  ["supplier", m.form.supplierPrice],
                  ["shipping", m.form.shippingCost],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-${key}`} className="text-xs font-normal text-muted-foreground">
                    {label}
                  </Label>
                  <Input id={`${id}-${key}`} inputMode="decimal" value={prices[key]} onChange={(e) => setPrices({ ...prices, [key]: e.target.value })} className="h-10" />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={view.kind === "running"}>
              {view.kind === "running" ? m.form.running : m.form.submit}
            </Button>
            {view.kind === "running" && view.runId && (
              <Button type="button" variant="ghost" onClick={() => void cancelRun(view.runId as string)}>
                {m.queue.cancel}
              </Button>
            )}
          </div>
          {view.kind === "running" && <p className="text-sm text-muted-foreground">{m.queue.leave}</p>}
        </div>
      </form>

      {view.kind === "failed" && (
        <p role="alert" className="mt-6 text-center text-sm text-muted-foreground">
          {view.message}
        </p>
      )}
      {view.kind === "done" && view.savedId && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href={`/analyses/runs/${view.savedId}`} className="underline decoration-line underline-offset-4 hover:decoration-foreground">
            {m.saved}
          </Link>
        </p>
      )}
      {view.kind === "done" && <DeepReportView report={view.report} />}
    </>
  );
}
