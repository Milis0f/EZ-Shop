"use client";

import { useId, useState, type FormEvent } from "react";
import { AiAura } from "@/components/ai/ai-aura";
import { AiBadge } from "@/components/ai/ai-badge";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { competitorResponseSchema, type CompetitorResponse } from "@/domain/web";
import { useMessages } from "@/i18n/client";
import { SpotlightArea } from "@/components/marketing/spotlight";
import { TermBar } from "@/components/marketing/term";
import { CompetitorReport } from "./competitor-report";
import { runWebResearch } from "./web-research-store";
import { WebResearchResult } from "./web-research";

type View = { readonly kind: "idle" } | { readonly kind: "reading" } | { readonly kind: "done"; readonly response: CompetitorResponse } | { readonly kind: "error" };

function CheckForm() {
  const m = useMessages("web").competitor;
  const r = useMessages("competitorReport");
  const failures = useMessages("web").results;
  const [url, setUrl] = useState("");
  const [deep, setDeep] = useState(true);
  const [view, setView] = useState<View>({ kind: "idle" });
  const urlId = useId();
  const supplierId = useId();

  async function check(address: string) {
    setView({ kind: "reading" });
    try {
      const response = await fetch("/api/web/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: address, searchSupplier: deep, deep }),
      });
      const parsed = competitorResponseSchema.safeParse(((await response.json()) as { data?: unknown }).data);
      setView(parsed.success ? { kind: "done", response: parsed.data } : { kind: "error" });
    } catch {
      setView({ kind: "error" });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void check(url);
  }

  function checkProduct(address: string) {
    setUrl(address);
    void check(address);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <form onSubmit={submit} className="spot">
        <TermBar title="ez-shop — concurrent" />
        <div className="flex flex-col gap-5 p-6 sm:p-9">
        <div className="flex flex-col gap-2">
          <Label htmlFor={urlId}>{m.urlLabel}</Label>
          <Input id={urlId} type="text" inputMode="url" required minLength={4} maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={m.urlPlaceholder} className="h-11" />
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id={supplierId} checked={deep} onCheckedChange={(value) => setDeep(value === true)} className="mt-0.5" />
          <Label htmlFor={supplierId} className="flex flex-col items-start gap-0.5 font-normal">
            <span>{r.deep}</span>
            <span className="text-xs text-muted-foreground">{r.deepHint}</span>
          </Label>
        </div>
        <Button type="submit" disabled={view.kind === "reading"} className="self-start">
          {view.kind === "reading" ? m.reading : m.submit}
        </Button>
        </div>
      </form>

      {view.kind === "reading" && (
        <AiAura state="thinking" className="mt-8" surfaceClassName="p-5 sm:p-6">
          <AiBadge label={m.readingBadge} state="thinking" />
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {m.reading}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{r.steps.title}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {(deep ? (["page", "shop", "best", "domain", "ads"] as const) : (["page", "shop", "best"] as const)).map((step, i) => (
              <li key={step} className="competitor-step flex items-center gap-2.5" style={{ animationDelay: `${i * 1.2}s` }}>
                <span aria-hidden className="size-1.5 rounded-full bg-[var(--craie)]" />
                {r.steps[step]}
              </li>
            ))}
          </ul>
        </AiAura>
      )}
      {view.kind === "error" && (
        <p role="alert" className="mt-4 text-center text-sm text-muted-foreground">
          {failures.requestFailed}
        </p>
      )}
      {view.kind === "done" && view.response.status === "blocked" && (
        <p role="alert" className="mt-4 text-center text-sm text-muted-foreground">
          {m.blocked[view.response.code]}
        </p>
      )}
      {view.kind === "done" && view.response.status === "ready" && <CompetitorReport result={view.response} onCheck={checkProduct} />}
    </>
  );
}

function FreeSearch() {
  const m = useMessages("web").competitor;
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState<string | null>(null);
  const id = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const words = draft.trim();
    if (words.length < 2) return;
    setQuery(words);
    void runWebResearch(words);
  }

  return (
    <section className="mt-20" aria-labelledby="free-search-title">
      <h2 id="free-search-title" className="font-mono text-[clamp(1.375rem,2.8vw,2rem)] leading-tight font-semibold tracking-[-0.05em]">
        {m.searchTitle}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{m.searchIntro}</p>
      <form onSubmit={submit} className="spot mt-6">
        <TermBar title="ez-shop — web" />
        <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-end sm:p-9">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={id}>{m.searchLabel}</Label>
          <Input id={id} type="text" required minLength={2} maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={m.searchPlaceholder} className="h-11" />
        </div>
        <Button type="submit">{m.searchSubmit}</Button>
        </div>
      </form>
      {query && (
        <div className="panel mt-4 p-5 sm:p-6">
          <WebResearchResult query={query} />
        </div>
      )}
    </section>
  );
}

export function CompetitorCheck() {
  return (
    <>
      <AiInstallButton className="mb-10" />
      <SpotlightArea>
        <CheckForm />
        <FreeSearch />
      </SpotlightArea>
    </>
  );
}
