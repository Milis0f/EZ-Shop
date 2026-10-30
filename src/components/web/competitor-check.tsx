"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { AiInstallButton } from "@/components/ai/ai-install-button";
import { KindMarker } from "@/components/data/kind-marker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DATA_INSUFFICIENT } from "@/domain/datum";
import { competitorResponseSchema, type CompetitorResponse } from "@/domain/web";
import { useFormat, useMessages } from "@/i18n/client";
import type { Formatters } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { runWebResearch } from "./web-research-store";
import { WebResearchResult } from "./web-research";
import { ExternalLink, WebReadingBlock, WebSourceList } from "./web-results";

type Ready = Extract<CompetitorResponse, { status: "ready" }>;

type View = { readonly kind: "idle" } | { readonly kind: "reading" } | { readonly kind: "done"; readonly response: CompetitorResponse } | { readonly kind: "error" };

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="tabular text-sm font-medium break-words sm:text-right">{value}</dd>
    </div>
  );
}

function Insufficient() {
  return (
    <span className="inline-flex items-center gap-2 font-normal text-muted-foreground">
      <KindMarker kind="insufficient" />
      {DATA_INSUFFICIENT}
    </span>
  );
}

function priceText(o: Ready["observed"], f: Formatters): string | null {
  if (o.priceMin === null) return null;
  const money = (v: number) => (o.currency ? f.money(v, o.currency) : f.number(v, { maximumFractionDigits: 2 }));
  return o.priceMax !== null && o.priceMax !== o.priceMin ? `${money(o.priceMin)} – ${money(o.priceMax)}` : money(o.priceMin);
}

function Report({ result }: { readonly result: Ready }) {
  const m = useMessages("web").competitor;
  const f = useFormat();
  const o = result.observed;
  const known = (value: ReactNode | null) => value ?? <Insufficient />;
  const metaUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&q=${encodeURIComponent(result.domain)}`;
  const lensUrl = o.image ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(o.image)}` : null;

  return (
    <div className="mt-8 flex flex-col gap-4">
      <section className="panel p-5 sm:p-6" aria-labelledby="observed-title">
        <h2 id="observed-title" className="flex items-center gap-2 text-base font-semibold">
          <KindMarker kind="observed" />
          {m.observedTitle}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(m.observedIntro, { domain: result.domain })} {m.platform[result.platform]}.
        </p>
        <dl className="mt-3 divide-y divide-line">
          <Fact label={m.fields.name} value={known(o.name)} />
          <Fact label={m.fields.vendor} value={known(o.vendor)} />
          <Fact label={m.fields.price} value={known(priceText(o, f))} />
          <Fact label={m.fields.variants} value={known(o.variants === null ? null : f.int(o.variants))} />
          <Fact label={m.fields.inStock} value={known(o.variantsInStock === null ? null : f.int(o.variantsInStock))} />
          <Fact label={m.fields.published} value={known(o.publishedAt && !Number.isNaN(Date.parse(o.publishedAt)) ? f.date(o.publishedAt) : null)} />
          <Fact label={m.fields.reviews} value={known(o.reviewCount === null ? null : f.int(o.reviewCount))} />
          <Fact label={m.fields.rating} value={known(o.rating === null ? null : f.decimal(o.rating))} />
          <Fact label={m.fields.delivery} value={known(o.deliveryText)} />
          <Fact label={m.fields.apps} value={result.apps.length ? result.apps.join(", ") : m.none} />
        </dl>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="sales-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sales-title" className="text-base font-semibold">
            {m.salesTitle}
          </h2>
          <Insufficient />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{m.salesBody}</p>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="hypotheses-title">
        <h2 id="hypotheses-title" className="flex items-center gap-2 text-base font-semibold">
          <KindMarker kind="assumption" />
          {m.hypothesesTitle}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{m.hypothesesIntro}</p>
        {result.signals.length > 0 ? (
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {result.signals.map((signal) => (
              <li key={signal}>{m.signals[signal]}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{m.noSignal}</p>
        )}
        <h3 className="mt-5 text-sm font-medium">{m.suppliersTitle}</h3>
        <SupplierBlock result={result} />
        <h3 className="mt-5 text-sm font-medium">{m.checkYourself}</h3>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          <li>
            <ExternalLink href={metaUrl}>{m.metaAds}</ExternalLink>
          </li>
          {o.name && (
            <li>
              <ExternalLink href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(o.name)}`}>{m.searchAliexpress}</ExternalLink>
            </li>
          )}
          {lensUrl && (
            <li>
              <ExternalLink href={lensUrl}>{m.lens}</ExternalLink>
            </li>
          )}
        </ul>
      </section>

      <WebReadingBlock reading={result.reading} badge={m.readingBadge} />
    </div>
  );
}

function SupplierBlock({ result }: { readonly result: Ready }) {
  const web = useMessages("web");
  const m = web.competitor;
  if (result.supplierSearch === "not_asked") return <p className="mt-1 text-sm text-muted-foreground">{m.suppliersNotAsked}</p>;
  if (result.supplierSearch !== "done") {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{web.results.failures[result.supplierSearch]}</p>
        {result.supplierSearch === "search_not_installed" && <code className="self-start rounded-pill bg-surface-2 px-4 py-1.5 text-sm">npm run search:setup</code>}
      </div>
    );
  }
  if (!result.suppliers?.length) return <p className="mt-1 text-sm text-muted-foreground">{m.suppliersEmpty}</p>;
  return <WebSourceList sources={result.suppliers} />;
}

function CheckForm() {
  const m = useMessages("web").competitor;
  const failures = useMessages("web").results;
  const [url, setUrl] = useState("");
  const [supplier, setSupplier] = useState(false);
  const [view, setView] = useState<View>({ kind: "idle" });
  const urlId = useId();
  const supplierId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setView({ kind: "reading" });
    try {
      const response = await fetch("/api/web/competitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, searchSupplier: supplier }),
      });
      const parsed = competitorResponseSchema.safeParse(((await response.json()) as { data?: unknown }).data);
      setView(parsed.success ? { kind: "done", response: parsed.data } : { kind: "error" });
    } catch {
      setView({ kind: "error" });
    }
  }

  return (
    <>
      <form onSubmit={(event) => void submit(event)} className="panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor={urlId}>{m.urlLabel}</Label>
          <Input id={urlId} type="text" inputMode="url" required minLength={4} maxLength={2000} value={url} onChange={(e) => setUrl(e.target.value)} placeholder={m.urlPlaceholder} className="h-11" />
        </div>
        <div className="flex items-start gap-3">
          <Checkbox id={supplierId} checked={supplier} onCheckedChange={(value) => setSupplier(value === true)} className="mt-0.5" />
          <Label htmlFor={supplierId} className="flex flex-col items-start gap-0.5 font-normal">
            <span>{m.askSupplier}</span>
            <span className="text-xs text-muted-foreground">{m.askSupplierHint}</span>
          </Label>
        </div>
        <Button type="submit" disabled={view.kind === "reading"} className="self-start">
          {view.kind === "reading" ? m.reading : m.submit}
        </Button>
      </form>

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
      {view.kind === "done" && view.response.status === "ready" && <Report result={view.response} />}
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
    <section className="mt-14" aria-labelledby="free-search-title">
      <h2 id="free-search-title" className="text-xl font-semibold tracking-tight">
        {m.searchTitle}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{m.searchIntro}</p>
      <form onSubmit={submit} className="panel mt-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Label htmlFor={id}>{m.searchLabel}</Label>
          <Input id={id} type="text" required minLength={2} maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={m.searchPlaceholder} className="h-11" />
        </div>
        <Button type="submit">{m.searchSubmit}</Button>
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
      <CheckForm />
      <FreeSearch />
    </>
  );
}
