"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useSyncExternalStore } from "react";
import { prefersReducedMotion } from "@/components/motion/use-reduced-motion";
import { cn } from "@/lib/utils";
import { MODE_STORAGE_KEY, type AppMode } from "./mode";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  return () => observer.disconnect();
}

const currentMode = (): AppMode => (document.documentElement.dataset.mode === "advanced" ? "advanced" : "simple");

export function setMode(mode: AppMode): void {
  const apply = () => {
    document.documentElement.dataset.mode = mode;
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // Storage unavailable (private mode): the choice lasts for this page only.
    }
  };
  if (prefersReducedMotion() || typeof document.startViewTransition !== "function") apply();
  else document.startViewTransition(apply);
}

export function useMode(): AppMode | null {
  // null on the server: the mode is only known in the browser (set before paint by MODE_INIT_SCRIPT).
  return useSyncExternalStore(subscribe, currentMode, () => null);
}

/** "Mode avancé" under the simple search, "Mode simple" in the advanced sidebar. */
export function ModeToggle({ className, variant = "link", label: forced }: { className?: string; variant?: "link" | "button"; label?: string }) {
  const mode = useMode();
  const next: AppMode = mode === "advanced" ? "simple" : "advanced";
  const label = forced ?? (next === "advanced" ? "Mode avancé" : "Mode simple");

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-pressed={mode === "advanced"}
      className={cn(
        "interactive inline-flex items-center gap-1.5 rounded-lg text-sm",
        variant === "button" ? "border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface-2" : "px-2 py-1 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      {label}
      {variant === "link" && next === "advanced" && <ChevronDown className="size-3.5" aria-hidden />}
    </button>
  );
}
