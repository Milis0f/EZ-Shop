"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";
import { THEME_STORAGE_KEY, type Theme } from "./theme";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const currentTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

function setTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice simply lasts for this page.
  }
}

/** Cross-fades the whole page when the browser supports view transitions; instant otherwise. */
function applyTheme(theme: Theme): void {
  if (theme === currentTheme()) return;
  if (prefersReducedMotion() || typeof document.startViewTransition !== "function") setTheme(theme);
  else document.startViewTransition(() => setTheme(theme));
}

const OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Clair", icon: Sun },
  { value: "dark", label: "Sombre", icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  // null on the server: the real theme is only known in the browser.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  return (
    <div role="radiogroup" aria-label="Thème" className={cn("relative inline-grid grid-cols-2 rounded-md border border-line p-0.5", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-[5px] bg-surface-2 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]",
          theme === null && "opacity-0",
        )}
        style={{ transform: `translateX(${theme === "dark" ? 100 : 0}%)` }}
      />
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(value)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-[var(--dur-base)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              active && "text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
