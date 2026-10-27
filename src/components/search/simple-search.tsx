"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useState, useSyncExternalStore } from "react";
import { submitAnalysis } from "@/app/actions";
import { INITIAL_SEARCH_STATE } from "@/app/search-form-state";
import { Expand } from "@/components/motion/expand";
import { PendingButton } from "@/components/motion/pending-button";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { COUNTRY_CODES } from "@/domain/country";
import { cn } from "@/lib/utils";
import { controlClass, DETAIL_FIELDS, InlineAlert, PriceFields, ProductFields, useDetailValues } from "./product-details";
import { isAddressLike, readSupplierInput, resolveProductName } from "./supplier-input";
import { SupplierLinkChip } from "./supplier-link-chip";

const SCOPES = [
  { value: "FR", label: "France" },
  { value: "world", label: "Monde entier" },
] as const;

type Scope = (typeof SCOPES)[number]["value"];

const COUNTRIES_BY_SCOPE: Readonly<Record<Scope, readonly string[]>> = { FR: ["FR"], world: COUNTRY_CODES };

const PLACEHOLDER_WIDE = "Nom du produit ou lien de la fiche";
const PLACEHOLDER_NARROW = "Produit ou lien de la fiche";
const WIDE_QUERY = "(min-width: 640px)";

function subscribeWide(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The long placeholder only where it fits; phones get the short one so it never runs out of the capsule. */
function usePlaceholder(): string {
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true);
  return wide ? PLACEHOLDER_WIDE : PLACEHOLDER_NARROW;
}

const DETAIL_ERROR_FIELDS: ReadonlySet<string> = new Set<string>([...DETAIL_FIELDS, "economics"]);

/**
 * The simple mode home: one capsule for a name or a supplier link, where to look, and the optional
 * prices in a drawer. Everything else (translations, data sources) is automatic or in the advanced mode.
 */
export function SimpleSearch() {
  const [state, action, pending] = useActionState(submitAnalysis, INITIAL_SEARCH_STATE);
  const [capsule, setCapsule] = useState("");
  const [typedName, setTypedName] = useState("");
  const [scope, setScope] = useState<Scope>("FR");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const details = useDetailValues();
  const placeholder = usePlaceholder();

  const input = readSupplierInput(capsule);
  const asUrl = input.kind === "product" || input.kind === "guidance" || isAddressLike(capsule);
  const productName = asUrl ? resolveProductName(typedName, input) : capsule.trim();
  const errors = state.fieldErrors ?? {};
  const detailErrors = Object.keys(errors).some((key) => DETAIL_ERROR_FIELDS.has(key));
  const capsuleError = errors.supplierUrl ?? (asUrl ? undefined : errors.productName);
  const blocked = input.kind === "guidance";

  // A refused price or customs value opens the drawer once, on the answer that reports it.
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    if (detailErrors) setDetailsOpen(true);
  }

  const submit = (className: string) => (
    <PendingButton pending={pending} disabled={blocked} pendingLabel="Analyse en cours" className={className}>
      Analyser
    </PendingButton>
  );

  return (
    <form action={action} className="mx-auto w-full max-w-3xl pt-[8vh] pb-6 text-center sm:pt-[12vh]" aria-busy={pending}>
      <input type="hidden" name="inputLanguage" value="fr" />
      <input type="hidden" name="productName" value={productName} />
      {asUrl && <input type="hidden" name="supplierUrl" value={capsule.trim()} />}
      {COUNTRIES_BY_SCOPE[scope].map((c) => (
        <input key={c} type="hidden" name="countries" value={c} />
      ))}

      <label htmlFor="simple-product" className="text-[0.9375rem] text-muted-foreground">
        Quel produit veux-tu vérifier&nbsp;?
      </label>

      <div
        className={cn(
          "@container mt-5 flex items-center gap-3 rounded-pill border border-line bg-surface py-2 pr-2 pl-5 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)] sm:pl-8",
          "hover:border-foreground/15 has-[input:focus-visible]:border-foreground/30 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-4 has-[input:focus-visible]:outline-ring",
          capsuleError && "border-[var(--verdict-non)]",
        )}
      >
        <input
          id="simple-product"
          type="text"
          required
          minLength={2}
          maxLength={2000}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={capsule}
          onChange={(e) => setCapsule(e.target.value)}
          aria-invalid={Boolean(capsuleError) || undefined}
          aria-describedby="simple-product-reading"
          className="h-12 min-w-0 flex-1 truncate bg-transparent font-display text-[clamp(1rem,calc((100cqi-12rem)/20),1.5rem)] font-medium tracking-[-0.02em] text-foreground placeholder:text-[var(--kind-missing)] focus-visible:outline-none sm:h-14"
        />
        {submit("max-sm:hidden h-14 px-8")}
      </div>
      {submit("mt-3 h-14 w-full sm:hidden")}

      <SupplierLinkChip id="simple-product-reading" input={input} className="mt-3" />

      {asUrl && input.kind !== "guidance" && (
        <div className="animate-slide-down mx-auto mt-2 max-w-sm">
          <label htmlFor="simple-name" className="sr-only">
            Nom du produit
          </label>
          <input
            id="simple-name"
            type="text"
            maxLength={80}
            autoComplete="off"
            required={input.kind !== "product"}
            placeholder={input.kind === "product" ? input.defaultName : "Nom du produit"}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            aria-invalid={Boolean(errors.productName) || undefined}
            className={cn(controlClass, "text-center")}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {input.kind === "product" ? "Nom facultatif : sans nom, celui-ci est utilisé." : "Donne un nom au produit pour cette adresse."}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <SegmentedControl options={SCOPES} value={scope} onChange={setScope} aria-label="Où chercher" disabled={pending} />
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="simple-details"
          onClick={() => setDetailsOpen((open) => !open)}
          className={cn(
            "interactive inline-flex min-h-12 items-center gap-2 rounded-pill border border-dashed px-5 text-[0.9375rem] font-medium whitespace-nowrap",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            detailsOpen || details.filled > 0 ? "border-foreground/25 text-foreground" : "border-foreground/15 text-muted-foreground hover:text-foreground",
          )}
        >
          Prix et livraison
          {details.filled > 0 && <span className="tabular text-muted-foreground">{details.filled}</span>}
          <ChevronDown
            aria-hidden
            strokeWidth={1.5}
            className={cn("size-4 transition-transform duration-[var(--dur-base)] ease-[var(--ease-spring)]", detailsOpen && "rotate-180")}
          />
        </button>
      </div>

      <p className="mt-3 text-[0.8125rem] text-muted-foreground">
        {scope === "world" ? `${COUNTRY_CODES.length} pays : Europe, Royaume-Uni, États-Unis, Canada, Australie.` : "Analyse du marché français."}
      </p>

      <Expand id="simple-details" open={detailsOpen} innerClassName="pt-6">
        <div className="panel space-y-8 p-5 text-left sm:p-8">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tout est facultatif. Ce que tu saisis est montré comme saisi par toi dans le rapport, à côté des données observées.
          </p>
          <PriceFields idPrefix="simple" values={details.values} onChange={details.set} errors={errors} />
          <div className="border-t border-line pt-8">
            <ProductFields idPrefix="simple" values={details.values} onChange={details.set} errors={errors} />
          </div>
        </div>
      </Expand>

      <div aria-live="polite" className="mt-4 min-h-5 text-sm text-muted-foreground">
        {pending ? (scope === "world" ? `Traduction et collecte dans ${COUNTRY_CODES.length} pays, environ 15 secondes.` : "Collecte des données, quelques secondes.") : ""}
      </div>

      <div className="mx-auto max-w-xl space-y-2">
        {capsuleError && <InlineAlert>{capsuleError}</InlineAlert>}
        {asUrl && errors.productName && <InlineAlert>{errors.productName}</InlineAlert>}
        {errors.countries && <InlineAlert>{errors.countries}</InlineAlert>}
        {state.error && <InlineAlert>{state.error}</InlineAlert>}
      </div>
    </form>
  );
}
