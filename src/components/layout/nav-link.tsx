"use client";

import { BookOpen, PlugZap, Search, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Also active on nested routes (e.g. /analyses/... for "/"). */
  readonly matchPrefixes: readonly string[];
}

const ITEMS: readonly NavItem[] = [
  { href: "/", label: "Analyses", icon: Search, matchPrefixes: ["/analyses"] },
  { href: "/connectors", label: "Sources de données", icon: PlugZap, matchPrefixes: [] },
  { href: "/methodology", label: "Méthode", icon: BookOpen, matchPrefixes: [] },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <>
      {ITEMS.map(({ href, label, icon: Icon, matchPrefixes }) => {
        const active = pathname !== null && (pathname === href || matchPrefixes.some((p) => pathname.startsWith(p)));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "interactive flex items-center gap-3 rounded-pill px-3.5 py-2 text-sm text-muted-foreground hover:bg-surface hover:text-foreground",
              active && "bg-surface text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </>
  );
}

/** Reads the URL: must render inside <Suspense> (Cache Components). */
export function MainNav() {
  return <NavLinks pathname={usePathname()} />;
}

/** Same links without active state, part of the static shell. */
export function MainNavFallback() {
  return <NavLinks pathname={null} />;
}
