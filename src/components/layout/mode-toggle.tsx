"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useSyncExternalStore } from "react";
import { viewTransition } from "@/components/motion/view-transition";
import { useMessages } from "@/i18n/client";
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
  // The DOM changes synchronously (data-mode on <html>), so no React flush is needed inside the update.
  // Under reduced motion, or without View Transitions, viewTransition() applies it straight away.
  void viewTransition(apply).catch(() => undefined);
}

export function useMode(): AppMode | null {
  // null on the server: the mode is only known in the browser (set before paint by MODE_INIT_SCRIPT).
  return useSyncExternalStore(subscribe, currentMode, () => null);
}

/** "Advanced mode" in the simple top bar and under the search, "Simple mode" in the advanced rail. */
export function ModeToggle({ className, variant = "link", label: forced }: { className?: string; variant?: "link" | "button"; label?: string }) {
  const mode = useMode();
  const m = useMessages("shell");
  const next: AppMode = mode === "advanced" ? "simple" : "advanced";
  const label = forced ?? (next === "advanced" ? m.mode.advanced : m.mode.simple);

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-pressed={mode === "advanced"}
      className={cn(
        "interactive inline-flex items-center gap-1.5 rounded-pill text-sm whitespace-nowrap",
        variant === "button"
          ? "min-h-10 border border-line bg-surface-2 px-4 py-2 font-medium hover:bg-line"
          : "px-2 py-1 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {/* The button stays on one line; on phones the icon gives way so the header row fits in 390px. */}
      <SlidersHorizontal className={cn("size-4", variant === "button" && "max-sm:hidden")} strokeWidth={1.75} aria-hidden />
      {label}
      {variant === "link" && next === "advanced" && <ChevronDown className="size-3.5" aria-hidden />}
    </button>
  );
}
