"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { COUNTRIES, COUNTRY_CODES, DEFAULT_COUNTRY_SELECTION, type CountryCode } from "@/domain/country";
import { cn } from "@/lib/utils";

const PRESETS: ReadonlyArray<{ readonly label: string; readonly codes: readonly CountryCode[] }> = [
  { label: "Sélection conseillée", codes: DEFAULT_COUNTRY_SELECTION },
  { label: "Union européenne", codes: COUNTRY_CODES.filter((c) => COUNTRIES[c].isEU) },
  { label: "Tous", codes: COUNTRY_CODES },
];

const sameSet = (a: ReadonlySet<CountryCode>, b: readonly CountryCode[]) => a.size === b.length && b.every((c) => a.has(c));

/**
 * Country chips backed by real checkboxes (name="countries"), so the form posts exactly what is shown.
 * Presets only change the selection; nothing is submitted until the user launches the analysis.
 */
export function CountryPicker({ error }: { error?: string }) {
  const [selected, setSelected] = useState<ReadonlySet<CountryCode>>(() => new Set(DEFAULT_COUNTRY_SELECTION));

  const toggle = (code: CountryCode) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <fieldset aria-describedby="countries-count">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <legend className="text-sm font-medium">Pays à comparer</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sélections rapides">
          {PRESETS.map((p) => {
            const active = sameSet(selected, p.codes);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(new Set(p.codes))}
                className={cn(
                  "interactive rounded-full border px-3 py-1 text-xs",
                  active ? "border-foreground/30 bg-surface-2 text-foreground" : "border-line text-muted-foreground hover:border-foreground/20 hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
            className="interactive rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Effacer
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {COUNTRY_CODES.map((code) => {
          const checked = selected.has(code);
          return (
            <label
              key={code}
              className={cn(
                "interactive flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm select-none",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                checked ? "border-foreground/25 bg-surface-2 text-foreground" : "border-line text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              <input type="checkbox" name="countries" value={code} checked={checked} onChange={() => toggle(code)} className="sr-only" />
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-[var(--dur-fast)]",
                  checked ? "border-foreground bg-foreground text-background" : "border-foreground/25",
                )}
              >
                {checked && <Check className="animate-check size-3" strokeWidth={3} />}
              </span>
              <span className="w-6 shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground">{code}</span>
              <span className="truncate">{COUNTRIES[code].nameFr}</span>
            </label>
          );
        })}
      </div>

      <p id="countries-count" aria-live="polite" className={cn("mt-3 text-xs", selected.size === 0 ? "text-decision-test" : "text-muted-foreground")}>
        {selected.size === 0 ? "Aucun pays sélectionné : choisis-en au moins un." : `${selected.size} pays sur ${COUNTRY_CODES.length}`}
      </p>
      {error && <p className="mt-1.5 text-xs text-decision-avoid">{error}</p>}
    </fieldset>
  );
}
