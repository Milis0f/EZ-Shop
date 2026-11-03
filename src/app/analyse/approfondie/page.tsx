import type { Metadata } from "next";
import { Suspense } from "react";
import { ModeSetter } from "@/components/layout/mode-setter";
import { TermPrompt } from "@/components/marketing/term";
import { ConnectorsSummary } from "@/components/search/connectors-summary";
import { SearchForm } from "@/components/search/search-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getMessages } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("shell");
  return { title: m.orbit.analyse.deep };
}

/** In-depth analysis: every setting, the sources beside the form, and the full report afterwards. */
export default async function DeepAnalysisPage() {
  const m = (await getMessages("home")).advanced;
  return (
    <div className="mx-auto max-w-6xl pt-[3vh]">
      <ModeSetter mode="advanced" />
      <header className="animate-enter max-w-2xl">
        <TermPrompt command="ez-shop analyse --approfondie" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>

      <div className="mt-12 grid items-start gap-5 min-[900px]:grid-cols-[1fr_19rem]">
        <section aria-label={m.formLabel} className="animate-enter min-w-0" style={{ "--stagger": 1 } as React.CSSProperties}>
          <SearchForm />
        </section>
        <aside aria-label={m.sourcesLabel} className="animate-enter min-[900px]:sticky min-[900px]:top-8" style={{ "--stagger": 2 } as React.CSSProperties}>
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-panel" />}>
            <ConnectorsSummary />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
