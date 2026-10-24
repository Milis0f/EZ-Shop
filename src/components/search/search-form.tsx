"use client";

import { useActionState } from "react";
import { submitAnalysis } from "@/app/actions";
import { INITIAL_SEARCH_STATE } from "@/app/search-form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LANGUAGE_CODES, LANGUAGE_LABELS_FR } from "@/domain/country";
import { ORIGIN_COUNTRIES } from "@/domain/origin";
import { cn } from "@/lib/utils";
import { CountryPicker } from "./country-picker";
import { ModeSwitch } from "./mode-switch";

const fieldClass = "mt-2 text-xs leading-relaxed text-muted-foreground";
const errorClass = "animate-slide-down mt-2 text-xs text-decision-avoid";
const control =
  "w-full rounded-pill border border-line bg-surface-2 px-4 text-sm text-foreground transition-colors duration-[var(--dur-fast)] hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring";

export function SearchForm({ mockAllowed }: { mockAllowed: boolean }) {
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL_SEARCH_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="panel space-y-10 p-6 sm:p-8" aria-describedby={state.error ? "form-error" : undefined} aria-busy={pending}>
      <div>
        <Label htmlFor="productName" className="text-sm">
          Produit
        </Label>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_11rem]">
          <Input
            id="productName"
            name="productName"
            required
            minLength={2}
            maxLength={80}
            placeholder="ex. chaussettes chauffantes"
            className={cn(control, "h-12 text-lg")}
            aria-invalid={Boolean(errors.productName)}
          />
          <select name="inputLanguage" defaultValue="fr" aria-label="Langue du terme saisi" className={cn(control, "h-12")}>
            {LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGE_LABELS_FR[code]}
              </option>
            ))}
          </select>
        </div>
        {errors.productName && <p className={errorClass}>{errors.productName}</p>}
      </div>

      <CountryPicker error={errors.countries} />

      <div>
        <Label htmlFor="extraTerms" className="text-sm">
          Traductions et synonymes
        </Label>
        <textarea
          id="extraTerms"
          name="extraTerms"
          rows={3}
          placeholder={"de: beheizbare Socken\nen: heated socks"}
          className={cn(control, "mt-3 rounded-tile py-2.5 font-normal")}
          aria-invalid={Boolean(errors.extraTerms)}
        />
        <p className={fieldClass}>
          Une ligne par langue. Sans terme dans la langue d&apos;un pays, le terme saisi est utilisé tel quel et le pays est signalé.
        </p>
        {errors.extraTerms && <p className={errorClass}>{errors.extraTerms}</p>}
      </div>

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="originCountry" className="text-sm">
            Pays d&apos;origine des produits
          </Label>
          <select id="originCountry" name="originCountry" required defaultValue="" className={cn(control, "mt-3 h-10")} aria-invalid={Boolean(errors.originCountry)}>
            <option value="" disabled>
              Choisir le pays d&apos;expédition…
            </option>
            {ORIGIN_COUNTRIES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.nameFr}
              </option>
            ))}
          </select>
          {errors.originCountry && <p className={errorClass}>{errors.originCountry}</p>}
        </div>
        <div>
          <Label htmlFor="hsCode" className="text-sm">
            Code douanier SH <span className="font-normal text-muted-foreground">(facultatif)</span>
          </Label>
          <Input id="hsCode" name="hsCode" inputMode="numeric" placeholder="ex. 6115 95" className={cn(control, "mt-3 h-10")} aria-invalid={Boolean(errors.hsCode)} />
          {errors.hsCode && <p className={errorClass}>{errors.hsCode}</p>}
        </div>
        <p className={cn(fieldClass, "mt-0 sm:col-span-2")}>
          L&apos;origine fixe les droits de douane de chaque pays. Sans code SH, il est cherché dans le tarif douanier à partir du terme
          anglais (ajoute une ligne « en: … » pour l&apos;aider).
        </p>
      </div>

      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="sellingPrice" className="text-sm">
            Prix de vente HT (€)
          </Label>
          <Input id="sellingPrice" name="sellingPrice" inputMode="decimal" placeholder="facultatif" className={cn(control, "mt-3 h-10")} />
        </div>
        <div>
          <Label htmlFor="landedCost" className="text-sm">
            Coût de revient unitaire (€)
          </Label>
          <Input id="landedCost" name="landedCost" inputMode="decimal" placeholder="produit + livraison" className={cn(control, "mt-3 h-10")} />
        </div>
        <p className={cn(fieldClass, "mt-0 sm:col-span-2")}>
          Sans coût de revient, le prix AliExpress médian est utilisé s&apos;il est connecté. Sans prix de vente, la marge est calculée au
          prix du marché (eBay).
        </p>
        {errors.economics && <p className={cn(errorClass, "mt-0 sm:col-span-2")}>{errors.economics}</p>}
      </div>

      {mockAllowed && <ModeSwitch />}

      <div className="border-t border-line pt-8">
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={pending} className="h-11 px-6">
            {pending ? "Analyse en cours…" : "Lancer l'analyse"}
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {pending ? "Collecte des sources et simulation, pays par pays." : ""}
          </p>
        </div>
        {pending && (
          <div aria-hidden className="mt-5 h-0.5 overflow-hidden rounded-full bg-surface-2">
            <div className="animate-indeterminate h-full w-2/5 rounded-full bg-foreground/60" />
          </div>
        )}
        {state.error && (
          <p id="form-error" role="alert" className={cn(errorClass, "text-sm")}>
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
