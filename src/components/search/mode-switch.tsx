"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "live", label: "Sources réelles" },
  { value: "mock", label: "Données fictives" },
] as const;

type Mode = (typeof OPTIONS)[number]["value"];

/**
 * Two-option segmented control over real radios (name="dataMode"). The thumb slides to the
 * chosen option; picking the mock data turns it into the mock colour so the choice is never subtle.
 */
export function ModeSwitch() {
  const [mode, setMode] = useState<Mode>("live");
  const index = OPTIONS.findIndex((o) => o.value === mode);

  return (
    <fieldset>
      <legend className="text-sm font-medium">Source des données</legend>
      <div className="relative mt-3 grid w-full max-w-sm grid-cols-2 rounded-pill border border-line bg-surface p-1 text-sm">
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-pill transition-[transform,background-color] duration-[var(--dur-base)] ease-[var(--ease-out)]",
            mode === "mock" ? "bg-kind-mock/15" : "bg-surface-2",
          )}
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              "relative z-10 flex cursor-pointer items-center justify-center rounded-pill px-3 py-2 transition-colors duration-[var(--dur-base)]",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
              mode === o.value ? (o.value === "mock" ? "text-kind-mock" : "text-foreground") : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input type="radio" name="dataMode" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {mode === "mock" && (
        <p className="animate-slide-down mt-2 text-xs text-kind-mock">Valeurs synthétiques de développement, sans rapport avec le marché.</p>
      )}
    </fieldset>
  );
}
