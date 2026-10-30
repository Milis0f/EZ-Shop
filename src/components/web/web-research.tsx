"use client";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { declineWebResearch, runWebResearch, useWebResearch } from "./web-research-store";
import { WebReadingBlock, WebSourceList } from "./web-results";

/** Results of a search already asked for. */
export function WebResearchResult({ query }: { readonly query: string }) {
  const m = useMessages("web").results;
  const view = useWebResearch(query);

  if (view.kind === "searching") {
    return (
      <p role="status" className="py-4 text-center text-sm text-muted-foreground">
        {m.searching}
      </p>
    );
  }
  if (view.kind === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          {m.requestFailed}
        </p>
        <Button type="button" variant="outline" onClick={() => void runWebResearch(query)}>
          {m.again}
        </Button>
      </div>
    );
  }
  if (view.kind !== "done") return null;
  const { response } = view;

  if (response.status === "unavailable") {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <p className="text-sm text-muted-foreground">{m.failures[response.code]}</p>
        {response.code === "search_not_installed" && <code className="rounded-pill bg-surface-2 px-4 py-1.5 text-sm">npm run search:setup</code>}
        <Button type="button" variant="outline" onClick={() => void runWebResearch(query)}>
          {m.again}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">{m.notVerified}</p>
      <WebReadingBlock reading={response.reading} badge={m.badge} />
      <div>
        <h4 className="text-sm font-medium">{m.sources}</h4>
        <WebSourceList sources={response.sources} />
      </div>
    </div>
  );
}

/** Under a report: asks first. No search runs, and nothing leaves the computer, until the answer is yes. */
export function WebResearchAsk({ query, className }: { readonly query: string; readonly className?: string }) {
  const web = useMessages("web");
  const view = useWebResearch(query);

  return (
    <section aria-label={web.results.title} className={cn("panel p-5 sm:p-6", className)}>
      {view.kind === "ask" && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div>
            <h3 className="text-base font-semibold text-balance">{t(web.ask.question, { query })}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{web.ask.detail}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => void runWebResearch(query)}>
              {web.ask.yes}
            </Button>
            <Button type="button" variant="ghost" onClick={() => declineWebResearch(query)}>
              {web.ask.no}
            </Button>
          </div>
        </div>
      )}
      {view.kind === "declined" && (
        <div className="flex flex-wrap items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{web.ask.declined}</p>
          <Button type="button" variant="ghost" onClick={() => void runWebResearch(query)}>
            {web.ask.undo}
          </Button>
        </div>
      )}
      {view.kind !== "ask" && view.kind !== "declined" && <WebResearchResult query={query} />}
    </section>
  );
}
