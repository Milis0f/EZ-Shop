import { Suspense } from "react";
import { connection } from "next/server";
import { ConnectorsSummary } from "@/components/search/connectors-summary";
import { RecentAnalyses } from "@/components/search/recent-analyses";
import { SearchForm } from "@/components/search/search-form";
import { SimpleSearch } from "@/components/search/simple-search";
import { Skeleton } from "@/components/ui/skeleton";
import { mockDataAllowed } from "@/server/services";

async function SearchFormWithMode() {
  await connection();
  return <SearchForm mockAllowed={mockDataAllowed()} />;
}

const stagger = (i: number) => ({ "--stagger": i }) as React.CSSProperties;

export default function HomePage() {
  return (
    <>
      <div className="simple:block hidden">
        <SimpleSearch />
      </div>
      <div className="advanced:block hidden">
        <AdvancedHome />
      </div>
    </>
  );
}

function AdvancedHome() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Quel produit veux-tu évaluer&nbsp;?</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Le potentiel est estimé pays par pays, uniquement à partir de données externes. Ce qui ne peut pas être estimé honnêtement
          reste marqué en données insuffisantes, sans valeur de remplacement.
        </p>
      </header>

      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[1fr_19rem]">
        <section aria-label="Nouvelle analyse" className="animate-enter" style={stagger(1)}>
          <Suspense fallback={<Skeleton className="h-[38rem] w-full rounded-[0.875rem]" />}>
            <SearchFormWithMode />
          </Suspense>
        </section>
        <aside aria-label="État des sources" className="animate-enter lg:sticky lg:top-8" style={stagger(2)}>
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-[0.875rem]" />}>
            <ConnectorsSummary />
          </Suspense>
        </aside>
      </div>

      <section className="mt-20" aria-labelledby="recent-title">
        <h2 id="recent-title" className="mb-6 text-lg font-semibold tracking-tight">
          Analyses récentes
        </h2>
        <Suspense fallback={<Skeleton className="h-56 w-full rounded-[0.875rem]" />}>
          <RecentAnalyses />
        </Suspense>
      </section>
    </div>
  );
}
