import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EpistemicLegend } from "@/components/data/epistemic-legend";
import { cn } from "@/lib/utils";
import { ModeToggle } from "./mode-toggle";
import { MainNav, MainNavFallback, type NavLayout } from "./nav-link";

/** The logo morphs between the top bar and the rail during the mode switch (only one is ever displayed). */
const LOGO_TRANSITION = { viewTransitionName: "shell-logo" } as const;

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      style={LOGO_TRANSITION}
      className={cn(
        "interactive inline-flex items-center rounded-pill border border-line bg-surface px-[18px] py-2.5 font-display text-[15px] leading-none font-bold tracking-tight whitespace-nowrap hover:bg-surface-2",
        className,
      )}
    >
      EZ-Shop
    </Link>
  );
}

function Nav({ layout }: { layout: NavLayout }) {
  return (
    <Suspense fallback={<MainNavFallback layout={layout} />}>
      <MainNav layout={layout} />
    </Suspense>
  );
}

/**
 * Two interfaces in one shell, switched by data-mode on <html> (set before paint by MODE_INIT_SCRIPT):
 * - simple: a top bar with the logo and the « Mode avancé » pill, nothing else;
 * - advanced, from 900px: a floating rounded rail on the left with the navigation and the value legend;
 * - advanced, below 900px: the same top bar, and the navigation in a floating pill bar at the bottom.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-3 px-4 pt-5 pb-2 sm:px-8 advanced:min-[900px]:hidden">
        <Logo />
        <ModeToggle variant="button" />
      </header>

      <aside className="fixed inset-y-4 left-4 z-30 hidden w-60 flex-col overflow-y-auto rounded-panel border border-line bg-surface p-3 advanced:min-[900px]:flex">
        <div className="px-1 pt-1 pb-8">
          <Logo />
          <p className="mt-3 px-1 text-xs text-muted-foreground">Potentiel produit avant lancement</p>
        </div>
        <nav aria-label="Navigation principale">
          <Nav layout="rail" />
        </nav>
        <div className="mt-auto px-2 pt-10 pb-2">
          <p className="mb-4 text-xs font-medium text-muted-foreground">Lecture des valeurs</p>
          <EpistemicLegend compact />
          <ModeToggle variant="button" className="mt-6" />
        </div>
      </aside>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto hidden max-w-md rounded-pill border border-line bg-surface p-1.5 advanced:block advanced:min-[900px]:hidden"
      >
        <Nav layout="bar" />
      </nav>

      <main
        id="contenu"
        className={cn(
          "min-w-0 px-4 pt-4 pb-16 sm:px-12 lg:pb-20 2xl:px-20",
          // Advanced phones: room for the bottom bar (its height, its offset and the safe area).
          "advanced:pb-[calc(6.5rem+env(safe-area-inset-bottom))]",
          // Advanced desktop: clear the rail (16px offset, 240px wide) plus a gutter.
          "advanced:min-[900px]:pt-12 advanced:min-[900px]:pb-20 advanced:min-[900px]:pl-[calc(15rem+3rem)] advanced:2xl:pl-[calc(15rem+5rem)]",
        )}
      >
        {children}
      </main>
    </div>
  );
}
