import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EpistemicLegend } from "@/components/data/epistemic-legend";
import { ModeToggle } from "./mode-toggle";
import { MainNav, MainNavFallback } from "./nav-link";

/**
 * Two interfaces in one shell, switched by data-mode on <html>:
 * - simple: a slim top bar with the name, no sidebar; "Mode avancé" sits under the search and the report;
 * - advanced: the sidebar with navigation and the value legend.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen advanced:lg:grid advanced:lg:grid-cols-[17rem_1fr]">
      <header className="flex items-center justify-between gap-4 px-4 py-5 advanced:hidden sm:px-10">
        <Link
          href="/"
          className="interactive rounded-pill border border-line bg-surface px-4 py-2 font-display text-sm font-bold tracking-tight hover:bg-surface-2"
        >
          EZ-Shop
        </Link>
      </header>
      <aside className="border-b border-line bg-background simple:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-5 sm:gap-4 sm:px-6 lg:block lg:px-8 lg:py-10">
          <Link href="/" className="block rounded-menu">
            <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">EZ-Shop</span>
            <span className="mt-1 hidden text-xs text-muted-foreground lg:block">Potentiel produit avant lancement</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex gap-1 lg:mt-12 lg:flex-col lg:gap-1.5">
            <Suspense fallback={<MainNavFallback />}>
              <MainNav />
            </Suspense>
          </nav>
          <div className="flex items-center gap-2 lg:hidden">
            <ModeToggle variant="button" />
          </div>
        </div>
        <div className="hidden px-8 pb-10 lg:mt-auto lg:block">
          <p className="mb-4 text-xs font-medium text-muted-foreground">Lecture des valeurs</p>
          <EpistemicLegend compact />
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <ModeToggle variant="button" />
          </div>
        </div>
      </aside>
      <main id="contenu" className="min-w-0 px-4 py-10 simple:pt-4 sm:px-12 lg:py-16 simple:lg:pt-4 2xl:px-20">
        {children}
      </main>
    </div>
  );
}
