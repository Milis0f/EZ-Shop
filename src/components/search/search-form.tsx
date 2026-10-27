"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { submitAnalysis } from "@/app/actions";
import { INITIAL_SEARCH_STATE } from "@/app/search-form-state";
import { PendingButton } from "@/components/motion/pending-button";
import { LANGUAGE_CODES, LANGUAGE_LABELS_FR } from "@/domain/country";
import { cn } from "@/lib/utils";
import { CountryPicker } from "./country-picker";
import { controlClass, Field, InlineAlert, PriceFields, ProductFields, useDetailValues } from "./product-details";
import { readSupplierInput, resolveProductName } from "./supplier-input";
import { SupplierLinkChip } from "./supplier-link-chip";

function Group({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="panel space-y-6 p-5 sm:p-8">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/** The advanced form: the same fields as the simple mode, plus translations and the full country choice. */
export function SearchForm() {
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL_SEARCH_STATE);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("fr");
  const [extraTerms, setExtraTerms] = useState("");
  const details = useDetailValues();
  const errors = state.fieldErrors ?? {};

  const link = readSupplierInput(url);
  const productName = resolveProductName(name, link);

  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="productName" value={productName} />

      <Group title="Produit">
        <div className="grid gap-x-5 gap-y-6 min-[900px]:grid-cols-[1fr_12rem]">
          <Field
            id="productName"
            label="Nom du produit"
            help={link.kind === "product" ? `Facultatif avec ce lien : sans nom, « ${link.defaultName} ».` : "Le terme cherché, tel qu'un client le taperait."}
            typed={false}
          >
            <input
              id="productName"
              required={link.kind !== "product"}
              minLength={2}
              maxLength={80}
              autoComplete="off"
              placeholder={link.kind === "product" ? link.defaultName : "ex. chaussettes chauffantes"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby="productName-help"
              aria-invalid={Boolean(errors.productName) || undefined}
              className={cn(controlClass, "h-12 text-base")}
            />
          </Field>
          <Field id="inputLanguage" label="Langue du nom" help="Pour traduire vers chaque pays.">
            <div className="relative">
              <select
                id="inputLanguage"
                name="inputLanguage"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-describedby="inputLanguage-help"
                className={cn(controlClass, "h-12 appearance-none pr-10")}
              >
                {LANGUAGE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS_FR[code]}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden strokeWidth={1.5} className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>
        </div>
        {errors.productName && <InlineAlert>{errors.productName}</InlineAlert>}

        <Field id="supplierUrl" label="Lien de la fiche fournisseur" help="Temu, AliExpress, Alibaba ou 1688, reconnu sans rien télécharger.">
          <input
            id="supplierUrl"
            name="supplierUrl"
            type="text"
            inputMode="url"
            maxLength={2000}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-describedby="supplierUrl-help supplierUrl-reading"
            aria-invalid={Boolean(errors.supplierUrl) || undefined}
            className={controlClass}
          />
        </Field>
        <SupplierLinkChip id="supplierUrl-reading" input={link} className="-mt-3 min-h-0 justify-start" />
        {errors.supplierUrl && <InlineAlert>{errors.supplierUrl}</InlineAlert>}

        <Field
          id="extraTerms"
          label="Traductions et synonymes"
          help="Une ligne par langue. Sans terme dans la langue d'un pays, le nom saisi est utilisé tel quel et le pays est signalé."
        >
          <textarea
            id="extraTerms"
            name="extraTerms"
            rows={3}
            placeholder={"de: beheizbare Socken\nen: heated socks"}
            value={extraTerms}
            onChange={(e) => setExtraTerms(e.target.value)}
            aria-describedby="extraTerms-help"
            aria-invalid={Boolean(errors.extraTerms) || undefined}
            className={cn(controlClass, "h-auto rounded-tile py-3")}
          />
        </Field>
        {errors.extraTerms && <InlineAlert>{errors.extraTerms}</InlineAlert>}
      </Group>

      <Group title="Où chercher">
        <CountryPicker error={errors.countries} />
      </Group>

      <Group title="Prix et livraison">
        <PriceFields idPrefix="advanced" values={details.values} onChange={details.set} errors={errors} />
      </Group>

      <Group title="Catégorie et douane">
        <ProductFields idPrefix="advanced" values={details.values} onChange={details.set} errors={errors} />
      </Group>

      <div className="flex flex-wrap items-center gap-4 px-1 pt-2">
        <PendingButton pending={pending} disabled={link.kind === "guidance"} pendingLabel="Analyse en cours" className="h-12 px-8">
          Lancer l&apos;analyse
        </PendingButton>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {pending ? "Collecte des sources et simulation, pays par pays." : ""}
        </p>
      </div>
      {state.error && <InlineAlert>{state.error}</InlineAlert>}
    </form>
  );
}
