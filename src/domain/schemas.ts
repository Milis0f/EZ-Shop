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

const extraTermSchema = z.object({
  language: z.enum(LANGUAGE_CODES),
  term: z.string().trim().min(2).max(80),
});

const economicsSchema = z.object({
  /** Single input currency for now. TODO: per-country FX conversion (ECB reference rates). */
  currency: z.literal("EUR"),
  sellingPrice: z.number().positive().max(100_000).optional(),
  landedCost: z.number().nonnegative().max(100_000).optional(),
});

export const analysisInputSchema = z.object({
  productName: z.string().trim().min(2, "Nom de produit trop court").max(80),
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
