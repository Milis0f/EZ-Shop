import { z } from "zod";
import { ASSUMPTION_KEYS } from "./assumption";
import { COUNTRY_CODES, LANGUAGE_CODES } from "./country";
import { ORIGIN_CODES } from "./origin";

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

function userText(min: number, max: number, minMessage: string | undefined, forbiddenMessage: string) {
  return z
    .string()
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value) && value.isWellFormed(),
      forbiddenMessage,
    )
    .overwrite((value) => value.replace(/[\t\n\r]+/g, " ").trim())
    .min(min, minMessage)
    .max(max);
}

const extraTermSchema = z.object({
  language: z.enum(LANGUAGE_CODES),
  term: userText(2, 80, undefined, "Ce terme contient des caractères non autorisés."),
});

const economicsSchema = z.object({
  /** Single input currency for now. TODO: per-country FX conversion (ECB reference rates). */
  currency: z.literal("EUR"),
  sellingPrice: z.number().positive().max(100_000).optional(),
  landedCost: z.number().nonnegative().max(100_000).optional(),
});

export const analysisInputSchema = z.object({
  productName: userText(2, 80, "Nom de produit trop court", "Le nom du produit contient des caractères non autorisés."),
  inputLanguage: z.enum(LANGUAGE_CODES).default("fr"),
  /** Translations / synonyms supplied by the user — the only trusted multilingual terms today. */
  extraTerms: z.array(extraTermSchema).max(40).default([]),
  countries: z
    .array(z.enum(COUNTRY_CODES))
    .min(1, "Sélectionne au moins un pays")
    .max(COUNTRY_CODES.length)
    .transform((list) => [...new Set(list)]),
  dataMode: z.enum(["live", "mock"]).default("live"),
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
