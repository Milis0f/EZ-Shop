"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useState } from "react";
import { submitAnalysis } from "@/app/actions";
import { INITIAL_SEARCH_STATE } from "@/app/search-form-state";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { COUNTRY_CODES } from "@/domain/country";
import { cn } from "@/lib/utils";

const SCOPES = [
  { id: "FR", label: "France", countries: ["FR"] },
  { id: "world", label: "Monde entier", countries: [...COUNTRY_CODES] },
] as const;

type ScopeId = (typeof SCOPES)[number]["id"];

/**
 * The whole simple mode: a product name, where to look, one button. Everything else (translations,
 * origin, prices, data sources) is either automatic or in the advanced mode.
 */
export function SimpleSearch() {
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL_SEARCH_STATE);
  const [scope, setScope] = useState<ScopeId>("FR");
  const current = SCOPES.find((s) => s.id === scope) ?? SCOPES[0];
  const nameError = state.fieldErrors?.productName;

  return (
    <form action={action} className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-3xl flex-col items-center justify-center pb-16 text-center" aria-busy={pending}>
      <input type="hidden" name="inputLanguage" value="fr" />
      <input type="hidden" name="dataMode" value="live" />
      {current.countries.map((c) => (
        <input key={c} type="hidden" name="countries" value={c} />
      ))}

      <label htmlFor="simple-product" className="text-sm text-muted-foreground">
        Quel produit veux-tu vérifier&nbsp;?
      </label>
      <textarea
        id="simple-product"
        name="productName"
        required
        minLength={2}
        maxLength={80}
        rows={1}
        autoFocus
        placeholder="Nom du produit"
        aria-invalid={Boolean(nameError)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        className="mt-5 field-sizing-content w-full resize-none border-b-2 border-line bg-transparent px-2 pb-4 text-center text-4xl leading-tight font-semibold tracking-tight text-foreground transition-colors duration-[var(--dur-base)] placeholder:text-muted-foreground/40 focus-visible:border-foreground/60 focus-visible:outline-none sm:text-6xl"
      />
      {nameError && <p className="animate-slide-down mt-3 text-sm text-decision-avoid">{nameError}</p>}

      <div role="radiogroup" aria-label="Où chercher" className="relative mt-10 grid w-full max-w-xs grid-cols-2 rounded-full border border-line p-1 text-sm">
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface-2 transition-transform duration-[var(--dur-base)] ease-[var(--ease-out)]"
          style={{ transform: `translateX(${scope === "world" ? 100 : 0}%)` }}
        />
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={scope === s.id}
            onClick={() => setScope(s.id)}
            className={cn("relative z-10 rounded-full px-4 py-2 transition-colors duration-[var(--dur-base)]", scope === s.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {scope === "world" ? `${COUNTRY_CODES.length} pays : Europe, Royaume-Uni, États-Unis, Canada, Australie.` : "Analyse du marché français."}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="interactive group mt-10 inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-base font-semibold text-background hover:bg-foreground/85 disabled:opacity-70"
      >
        {pending ? "Analyse en cours…" : "Analyser"}
        {!pending && <ArrowRight className="size-4 transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5" aria-hidden />}
      </button>
      <div aria-live="polite" className="mt-4 h-5 text-sm text-muted-foreground">
        {pending ? (scope === "world" ? "Traduction et collecte dans 18 pays, environ 15 secondes." : "Collecte des données, quelques secondes.") : ""}
      </div>
      {pending && (
        <div aria-hidden className="mt-2 h-0.5 w-48 overflow-hidden rounded-full bg-surface-2">
          <div className="animate-indeterminate h-full w-2/5 rounded-full bg-foreground/60" />
        </div>
      )}
      {state.error && (
        <p role="alert" className="mt-4 text-sm text-decision-avoid">
          {state.error}
        </p>
      )}

      <ModeToggle className="mt-14" />
    </form>
  );
}
