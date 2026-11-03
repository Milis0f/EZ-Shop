"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { orbitItems } from "./orbit-items";
import "./orbit.css";

/**
 * Away from the home, the planet's places fold into a small ring of light at the top left: pointed at,
 * focused or tapped, it unfolds the same five places and their choices. The ring itself leads back home.
 */
export function OrbitDock() {
  const pathname = usePathname() ?? "/";
  const m = useMessages("shell").orbit;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = orbitItems(m);

  // A new page closes the menu.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (pathname === "/") return null;

  return (
    <div
      ref={ref}
      data-open={open || undefined}
      className="orbit-dock"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          (document.activeElement as HTMLElement | null)?.blur();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Link href="/" className="orbit-dock-ring" aria-label={m.home} title={m.home}>
          <span aria-hidden className="orbit-dock-core" />
        </Link>
        <button type="button" className="orbit-dock-toggle" aria-expanded={open} aria-controls="orbit-dock-panel" onClick={() => setOpen((v) => !v)}>
          {m.menu}
        </button>
      </div>
      <nav id="orbit-dock-panel" aria-label={m.label} className="orbit-dock-panel">
        <ul className="grid gap-1">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={item.key} style={{ "--j": index } as CSSProperties} className="orbit-dock-group">
                <p className={cn("flex items-center gap-2 px-3 pt-2 pb-1 font-mono text-xs font-semibold tracking-[-0.02em]", item.isActive(pathname) ? "text-foreground" : "text-muted-foreground")}>
                  <Icon aria-hidden strokeWidth={1.75} className="size-3.5" />
                  {item.title}
                </p>
                <ul>
                  {item.options.map((option) => (
                    <li key={option.href}>
                      <Link href={option.href} className="orbit-dock-link">
                        {option.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
        <LanguageSwitcher className="mt-3 border-t border-line px-2 pt-3" />
      </nav>
    </div>
  );
}
