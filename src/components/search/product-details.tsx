"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ORIGIN_COUNTRIES } from "@/domain/origin";
import { cn } from "@/lib/utils";

/** Pill control shared by both forms: ardoise fill, hairline, a craie focus ring that is always visible. */
export const controlClass =
  "h-11 w-full min-w-0 rounded-pill border border-line bg-surface-2 px-4 text-[0.9375rem] text-foreground placeholder:text-muted-foreground/70 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-foreground/20 focus-visible:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-[var(--verdict-non)]";

export const DETAIL_FIELDS = ["supplierPrice", "shippingCost", "sellingPrice", "targetMarginPct", "category", "originCountry", "hsCode"] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];
export type DetailValues = Readonly<Record<DetailField, string>>;

const EMPTY: DetailValues = Object.fromEntries(DETAIL_FIELDS.map((f) => [f, ""])) as Record<DetailField, string>;

/**
 * Controlled values of the price and customs fields. Controlled on purpose: a form action resets
 * uncontrolled fields after each submit, and a refused value must stay where the owner typed it.
 */
export function useDetailValues() {
  const [values, setValues] = useState<DetailValues>(EMPTY);
  const set = (field: DetailField, value: string) => setValues((prev) => ({ ...prev, [field]: value }));
  const filled = DETAIL_FIELDS.filter((f) => values[f].trim() !== "").length;
  return { values, set, filled } as const;
}

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  /** Shown next to the label once the owner has typed a value. */
  readonly typed?: boolean;
  readonly children: ReactNode;
}

/** Label, control and a one-line help in brume, tied together for assistive tech. */
export function Field({ id, label, help, typed = false, children }: FieldProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {typed && <span className="animate-slide-down text-xs text-muted-foreground">saisi par toi</span>}
      </div>
      <div className="mt-2">{children}</div>
      <p id={`${id}-help`} className="mt-1.5 px-1 text-xs leading-relaxed text-muted-foreground">
        {help}
      </p>
    </div>
  );
}

/** Inline rounded alert for a refused value or a failed submit. Craie text, a corail mark: no tinted panel. */
export function InlineAlert({ id, children, className }: { readonly id?: string; readonly children: ReactNode; readonly className?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className={cn("animate-slide-down flex items-start gap-3 rounded-tile border border-line bg-surface px-4 py-3 text-left text-sm leading-snug", className)}
    >
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--verdict-non)]" />
      <span>{children}</span>
    </p>
  );
}

interface AmountSpec {
  readonly field: Exclude<DetailField, "category" | "originCountry" | "hsCode">;
  readonly label: string;
  readonly help: string;
  readonly placeholder: string;
}

const AMOUNTS: readonly AmountSpec[] = [
  { field: "supplierPrice", label: "Prix fournisseur (€)", help: "Prix unitaire payé au fournisseur, sans la livraison.", placeholder: "ex. 4,20" },
  { field: "shippingCost", label: "Frais de livraison (€)", help: "Par unité, jusqu'au client.", placeholder: "ex. 2,50" },
  { field: "sellingPrice", label: "Prix de vente envisagé (€)", help: "Sans prix, la marge se calcule au prix observé sur le marché.", placeholder: "ex. 24,90" },
  { field: "targetMarginPct", label: "Marge visée (%)", help: "Entre 1 et 95 %, pour comparer au résultat.", placeholder: "ex. 40" },
];

interface DetailFieldsProps {
  readonly idPrefix: string;
  readonly values: DetailValues;
  readonly onChange: (field: DetailField, value: string) => void;
  readonly errors: Readonly<Record<string, string>>;
}

const grid = "grid gap-x-5 gap-y-6 min-[900px]:grid-cols-2";

/** Supplier price, shipping, selling price and target margin: amounts the owner types, never inferred. */
export function PriceFields({ idPrefix, values, onChange, errors }: DetailFieldsProps) {
  return (
    <div className="space-y-4">
      <div className={grid}>
        {AMOUNTS.map((a) => {
          const id = `${idPrefix}-${a.field}`;
          return (
            <Field key={a.field} id={id} label={a.label} help={a.help} typed={values[a.field].trim() !== ""}>
              <input
                id={id}
                name={a.field}
                inputMode="decimal"
                autoComplete="off"
                placeholder={a.placeholder}
                value={values[a.field]}
                onChange={(e) => onChange(a.field, e.target.value)}
                aria-describedby={`${id}-help`}
                aria-invalid={Boolean(errors.economics) || undefined}
                className={cn(controlClass, "tabular")}
              />
            </Field>
          );
        })}
      </div>
      {errors.economics && <InlineAlert>{errors.economics}</InlineAlert>}
    </div>
  );
}

/** Category, origin country and customs code. */
export function ProductFields({ idPrefix, values, onChange, errors }: DetailFieldsProps) {
  const id = (field: DetailField) => `${idPrefix}-${field}`;
  return (
    <div className="space-y-4">
      <div className={grid}>
        <Field id={id("category")} label="Catégorie" help="Telle que tu la nommes, jamais devinée." typed={values.category.trim() !== ""}>
          <input
            id={id("category")}
            name="category"
            maxLength={60}
            autoComplete="off"
            placeholder="ex. accessoires d'hiver"
            value={values.category}
            onChange={(e) => onChange("category", e.target.value)}
            aria-describedby={`${id("category")}-help`}
            aria-invalid={Boolean(errors.category) || undefined}
            className={controlClass}
          />
        </Field>
        <Field id={id("originCountry")} label="Pays d'origine" help="D'où part le colis : fixe les droits de douane de chaque pays.">
          <div className="relative">
          <select
            id={id("originCountry")}
            name="originCountry"
            value={values.originCountry}
            onChange={(e) => onChange("originCountry", e.target.value)}
            aria-describedby={`${id("originCountry")}-help`}
            aria-invalid={Boolean(errors.originCountry) || undefined}
            className={cn(controlClass, "appearance-none pr-10", values.originCountry === "" && "text-muted-foreground")}
          >
            <option value="">Non précisé</option>
            {ORIGIN_COUNTRIES.map((o) => (
              <option key={o.code} value={o.code}>
                {o.nameFr}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden strokeWidth={1.5} className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </Field>
        <Field
          id={id("hsCode")}
          label="Code douanier SH"
          help="4 à 10 chiffres. Sans code, il est cherché dans le tarif douanier."
          typed={values.hsCode.trim() !== ""}
        >
          <input
            id={id("hsCode")}
            name="hsCode"
            inputMode="numeric"
            autoComplete="off"
            placeholder="ex. 6115 95"
            value={values.hsCode}
            onChange={(e) => onChange("hsCode", e.target.value)}
            aria-describedby={`${id("hsCode")}-help`}
            aria-invalid={Boolean(errors.hsCode) || undefined}
            className={cn(controlClass, "tabular")}
          />
        </Field>
      </div>
      {(["category", "originCountry", "hsCode"] as const).map(
        (field) => errors[field] && <InlineAlert key={field}>{errors[field]}</InlineAlert>,
      )}
    </div>
  );
}
