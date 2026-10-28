import { Suspense } from "react";
import { ConnectorsSummary } from "@/components/search/connectors-summary";
import { RecentAnalyses } from "@/components/search/recent-analyses";
import { SearchForm } from "@/components/search/search-form";
import { SimpleSearch } from "@/components/search/simple-search";
import { Skeleton } from "@/components/ui/skeleton";
import type { Messages } from "@/i18n/messages";
import { getMessages } from "@/i18n/server";

const stagger = (i: number) => ({ "--stagger": i }) as React.CSSProperties;

export default async function HomePage() {
  const m = await getMessages("home");
  return (
    <>
      <div className="simple:block hidden">
        <SimpleSearch />
      </div>
      <div className="advanced:block hidden">
        <AdvancedHome m={m.advanced} />
      </div>

      <section className="mx-auto mt-16 max-w-6xl simple:max-w-3xl" aria-labelledby="recent-title">
        <h2 id="recent-title" className="mb-5 px-1 text-base font-semibold tracking-tight">
          {m.recent.title}
        </h2>
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-tile" />}>
          <RecentAnalyses />
        </Suspense>
      </section>
    </>
  );
}

function AdvancedHome({ m }: { readonly m: Messages<"home">["advanced"] }) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>

      <div className="mt-12 grid items-start gap-5 min-[900px]:grid-cols-[1fr_19rem]">
        <section aria-label={m.formLabel} className="animate-enter min-w-0" style={stagger(1)}>
          <SearchForm />
        </section>
        <aside aria-label={m.sourcesLabel} className="animate-enter min-[900px]:sticky min-[900px]:top-8" style={stagger(2)}>
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-panel" />}>
            <ConnectorsSummary />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
