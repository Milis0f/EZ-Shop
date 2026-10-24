import { z } from "zod";
import { ASSUMPTION_KEYS } from "./assumption";
import { COUNTRY_CODES, LANGUAGE_CODES } from "./country";
import { ORIGIN_CODES } from "./origin";
import { parseSupplierUrl } from "./supplier-url";

/** Validation at the system boundary (forms, API). Everything downstream trusts these types. */

const distributionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), value: z.number().nonnegative() }),
  z
    .object({
      type: z.literal("triangular"),
      min: z.number().nonnegative(),
      mode: z.number().nonnegative(),
      max: z.number().nonnegative(),
    })
    .refine((d) => d.min <= d.mode && d.mode <= d.max, { message: "min ≤ mode ≤ max requis" }),
]);

/** Refuses control characters (tab and line breaks aside) and lone surrogates, which storage cannot keep. */
function safeText(forbiddenMessage: string) {
  return z
    .string()
    // `abort` stops the chain here: without it a value made only of a forbidden character would also
    // fail `.min()` after the overwrite, and the form would show that last, misleading issue.
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value) && value.isWellFormed(), {
      message: forbiddenMessage,
      abort: true,
    });
}

function userText(min: number, max: number, minMessage: string | undefined, forbiddenMessage: string, maxMessage?: string) {
  return safeText(forbiddenMessage)
    .overwrite((value) => value.replace(/[\t\n\r]+/g, " ").trim())
    .min(min, minMessage)
    .max(max, maxMessage);
}

const extraTermSchema = z.object({
  language: z.enum(LANGUAGE_CODES),
  term: userText(2, 80, undefined, "Ce terme contient des caractères non autorisés."),
});

/**
 * Supplier product page, recognised offline. Short links and non-web addresses are refused with the parser's
 * guidance; an address that is not a supplier page is kept as typed (nothing is ever fetched from it), so
 * views link only to `parseSupplierUrl(...).canonicalUrl`, never to this text. A blank value means no address.
 */
const supplierUrlSchema = safeText("L'adresse contient des caractères non autorisés.")
  .trim()
  .max(2000, { message: "Adresse trop longue (2 000 caractères au plus).", abort: true })
  .superRefine((value, ctx) => {
    if (value === "") return;
    // A web address never holds whitespace: prose or a broken paste is refused instead of stored.
    if (/\s/.test(value)) {
      ctx.addIssue({ code: "custom", message: "Adresse invalide : colle l'adresse complète de la fiche produit, sans espace." });
      return;
    }
    const parsed = parseSupplierUrl(value);
    if (parsed.kind === "short_link" || parsed.kind === "invalid") ctx.addIssue({ code: "custom", message: parsed.message });
  })
  .transform((value) => (value === "" ? undefined : value));

const MAX_AMOUNT_EUR = 100_000;

/** A euro amount typed by the owner. `label` names it in messages: the form shows the prices as one group. */
const amount = (label: string) =>
  z.number({ error: `${label} : saisis un nombre.` }).max(MAX_AMOUNT_EUR, `${label} : 100 000 € au plus.`);

const LANDED_COST_WITH_SHIPPING_MESSAGE =
  "Coût de revient : il inclut déjà la livraison. Indique plutôt le prix fournisseur et les frais de livraison.";

const economicsSchema = z
  .object({
    /** Single input currency for now. TODO: per-country FX conversion (ECB reference rates). */
    currency: z.literal("EUR"),
    /** « Prix de vente envisagé ». */
    sellingPrice: amount("Prix de vente").positive("Prix de vente : indique un montant supérieur à 0 €.").optional(),
    /** Supplier unit price. */
    supplierPrice: amount("Prix fournisseur").positive("Prix fournisseur : indique un montant supérieur à 0 €.").optional(),
    /** Shipping cost to the customer, per unit. */
    shippingCost: amount("Frais de livraison").nonnegative("Frais de livraison : le montant ne peut pas être négatif.").optional(),
    targetMarginPct: z
      .number({ error: "Marge visée : saisis un nombre." })
      .min(1, "Marge visée : entre 1 et 95 %.")
      .max(95, "Marge visée : entre 1 et 95 %.")
      .optional(),
    /** Pre-V1 alias: one unit cost, product and delivery together. Above 0, since it can stand for the supplier price. */
    landedCost: amount("Coût de revient").positive("Coût de revient : indique un montant supérieur à 0 €.").optional(),
  })
  // A pre-V1 landed cost already includes delivery: it stands for the supplier price, with no shipping on top.
  // A typed shipping cost would be dropped by that reading, so it is refused rather than silently replaced.
  .superRefine((economics, ctx) => {
    if (economics.landedCost !== undefined && economics.supplierPrice === undefined && (economics.shippingCost ?? 0) > 0) {
      ctx.addIssue({ code: "custom", path: ["landedCost"], message: LANDED_COST_WITH_SHIPPING_MESSAGE });
    }
  })
  .transform((economics) =>
    economics.landedCost !== undefined && economics.supplierPrice === undefined
      ? { ...economics, supplierPrice: economics.landedCost, shippingCost: 0 }
      : economics,
  );

const MOCK_REMOVED_MESSAGE = "Les données fictives ont été retirées de l'application.";

export const analysisInputSchema = z.object({
  productName: userText(2, 80, "Nom de produit trop court", "Le nom du produit contient des caractères non autorisés."),
  supplierUrl: supplierUrlSchema.optional(),
  /** Free text typed by the owner, never inferred. */
  category: userText(
    2,
    60,
    "Catégorie trop courte (2 caractères au moins).",
    "La catégorie contient des caractères non autorisés.",
    "Catégorie trop longue (60 caractères au plus).",
  ).optional(),
  inputLanguage: z.enum(LANGUAGE_CODES).default("fr"),
  /** Translations / synonyms supplied by the user — the only trusted multilingual terms today. */
  extraTerms: z.array(extraTermSchema).max(40).default([]),
  countries: z
    .array(z.enum(COUNTRY_CODES))
    .min(1, "Sélectionne au moins un pays")
    .max(COUNTRY_CODES.length)
    .transform((list) => [...new Set(list)]),
  /** Real data only. Stored pre-V1 analyses may still say `mock`: they are read back, never re-validated. */
  dataMode: z
    .literal("live", { error: (issue) => (issue.input === "mock" ? MOCK_REMOVED_MESSAGE : "Mode de données inconnu.") })
    .default("live"),
  /** Country the goods ship from, for import duties. Without it, duties stay DATA_INSUFFICIENT. */
  originCountry: z.enum(ORIGIN_CODES).optional(),
  /** Customs code typed by the user (4 to 10 digits); overrides the tariff search. */
  hsCode: z
    .string()
    .transform((v) => v.replace(/[\s.]/g, ""))
    .pipe(z.string().regex(/^\d{4,10}$/, "Code SH : 4 à 10 chiffres"))
    .optional(),
  economics: economicsSchema.default({ currency: "EUR" }),
  assumptionOverrides: z.partialRecord(z.enum(ASSUMPTION_KEYS), distributionSchema).default({}),
});

export type AnalysisInput = z.output<typeof analysisInputSchema>;
export type AnalysisInputRaw = z.input<typeof analysisInputSchema>;
