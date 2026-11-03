"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { endAnalysis, reportAnalysis, startAnalysis } from "@/components/planet/planet-store";
import { countryName } from "@/components/search/display-names";
import { TermBar } from "@/components/marketing/term";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COUNTRY_CODES, type CountryCode } from "@/domain/country";
import { deepEventSchema, type DeepEvent, type DeepReport } from "@/domain/deep-research";
import { useLocale, useMessages } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import { DeepReportView } from "./deep-report";

/** Usual length of a deep analysis, for the ring until the first real steps arrive. */
const EXPECTED_MS = 150_000;

type View = { readonly kind: "idle" } | { readonly kind: "running" } | { readonly kind: "done"; readonly report: DeepReport } | { readonly kind: "failed"; readonly message: string };

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

  async function run(event: FormEvent) {
    event.preventDefault();
    const name = product.trim();
    if (name.length < 2 || view.kind === "running") return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setView({ kind: "running" });
    startAnalysis({ product: name, countries: [country], message: m.form.pending, expectedMs: EXPECTED_MS, phases: [] });
    let report: DeepReport | null = null;
    let failure: string | null = null;
    try {
      const response = await fetch("/api/research/deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: name, country, sellingPrice: parsePrice(prices.selling), supplierPrice: parsePrice(prices.supplier), shippingCost: parsePrice(prices.shipping) }),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        failure = response.status === 429 ? m.failures.rate_limited : m.failures.request;
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let raw: unknown;
            try {
              raw = JSON.parse(line);
            } catch {
              continue;
            }
            const parsed = deepEventSchema.safeParse(raw);
            if (!parsed.success) continue;
            const e = parsed.data;
            if (e.type === "step") reportAnalysis({ progress: e.progress, step: stepLabel(e, m.steps) });
            else if (e.type === "report") report = e.report;
            else failure = m.failures[e.code];
          }
          if (done) break;
        }
      }
    } catch {
      if (!abort.signal.aborted) failure = m.failures.request;
    } finally {
      endAnalysis();
    }
    setView(report ? { kind: "done", report } : { kind: "failed", message: failure ?? m.failures.request });
    if (report) window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
          <Button type="submit" disabled={view.kind === "running"} className="self-start">
            {view.kind === "running" ? m.form.running : m.form.submit}
          </Button>
        </div>
      </form>

      {view.kind === "failed" && (
        <p role="alert" className="mt-6 text-center text-sm text-muted-foreground">
          {view.message}
        </p>
      )}
      {view.kind === "done" && <DeepReportView report={view.report} />}
    </>
  );
}
