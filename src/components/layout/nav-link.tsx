"use client";

import { BookOpen, History, PlugZap, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly href: string;
  readonly label: string;
  /** Visible label in the phone bottom bar, where four full labels do not fit in 390px. */
  readonly shortLabel: string;
  readonly icon: LucideIcon;
  readonly isActive: (pathname: string) => boolean;
}

/**
 * "Analyses récentes" has no page of its own: it points at the home's recent list, and an opened
 * analysis (/analyses/...) counts as one of the recent analyses.
 */
const ITEMS: readonly NavItem[] = [
  { href: "/", label: "Nouvelle analyse", shortLabel: "Analyser", icon: Search, isActive: (p) => p === "/" },
  {
    href: "/#recent-title",
    label: "Analyses récentes",
    shortLabel: "Récentes",
    icon: History,
    isActive: (p) => p.startsWith("/analyses"),
  },
  { href: "/connectors", label: "Sources de données", shortLabel: "Sources", icon: PlugZap, isActive: (p) => p.startsWith("/connectors") },
  { href: "/methodology", label: "Méthode", shortLabel: "Méthode", icon: BookOpen, isActive: (p) => p.startsWith("/methodology") },
];

export type NavLayout = "rail" | "bar";

const ACTIVE = '[aria-current="page"]';

/** Places the indicator on the active item. Layout offsets ignore ancestor transforms (page fade). */
function writeIndicator(list: HTMLElement): boolean {
  const active = list.querySelector<HTMLElement>(ACTIVE);
  if (!active || active.offsetWidth === 0) {
    delete list.dataset.ind;
    return false;
  }
  list.style.setProperty("--ind-x", `${active.offsetLeft}px`);
  list.style.setProperty("--ind-y", `${active.offsetTop}px`);
  list.style.setProperty("--ind-w", `${active.offsetWidth}px`);
  list.style.setProperty("--ind-h", `${active.offsetHeight}px`);
  return true;
}

/**
 * The craie indicator slides to the active item on the spring easing when the route changes.
 * Before it is measured (server render, Suspense fallback), the active item paints the craie itself;
 * first placement and resizes snap, only a navigation animates.
 */
function useSlidingIndicator(pathname: string | null) {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const snap = () => {
      cancelAnimationFrame(frame);
      if (!writeIndicator(list)) return;
      list.dataset.ind = "ready";
      list.getBoundingClientRect();
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (list.dataset.ind) list.dataset.ind = "live";
        });
      });
    };
    snap();
    if (typeof ResizeObserver === "undefined") return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(snap);
    observer.observe(list);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && writeIndicator(list) && !list.dataset.ind) list.dataset.ind = "ready";
  }, [pathname]);

  return listRef;
}

function NavLinks({ pathname, layout }: { pathname: string | null; layout: NavLayout }) {
  const listRef = useSlidingIndicator(pathname);
  const rail = layout === "rail";

  return (
    <ul ref={listRef} className={cn("group/nav relative isolate", rail ? "flex flex-col gap-1" : "grid grid-cols-4 gap-1")}>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 -z-10 rounded-pill bg-foreground opacity-0",
          "h-(--ind-h) w-(--ind-w) translate-x-(--ind-x) translate-y-(--ind-y)",
          "group-data-[ind]/nav:opacity-100",
          "group-data-[ind=live]/nav:transition-[translate,width,height] group-data-[ind=live]/nav:duration-(--dur-slow) group-data-[ind=live]/nav:ease-spring",
        )}
      />
      {ITEMS.map(({ href, label, shortLabel, icon: Icon, isActive }) => {
        const active = pathname !== null && isActive(pathname);
        return (
          <li key={href} className="min-w-0">
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex rounded-pill text-muted-foreground transition-colors duration-(--dur-base) ease-out hover:text-foreground",
                rail
                  ? "items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
                  : "min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] leading-tight font-medium",
                active && "bg-foreground text-background hover:bg-foreground hover:text-background group-data-[ind]/nav:bg-transparent",
              )}
            >
              <Icon className={cn("shrink-0", rail ? "size-4" : "size-[18px]")} strokeWidth={1.75} aria-hidden />
              <span className="truncate">{rail ? label : shortLabel}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Reads the URL: must render inside <Suspense> (Cache Components). */
export function MainNav({ layout }: { layout: NavLayout }) {
  return <NavLinks pathname={usePathname()} layout={layout} />;
}

/** Same links without active state, part of the static shell. */
export function MainNavFallback({ layout }: { layout: NavLayout }) {
  return <NavLinks pathname={null} layout={layout} />;
}
