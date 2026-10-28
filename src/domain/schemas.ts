import { z } from "zod";
import { ASSUMPTION_KEYS } from "./assumption";
import { COUNTRY_CODES, LANGUAGE_CODES } from "./country";
import { ORIGIN_CODES } from "./origin";
import { parseSupplierUrl, SUPPLIER_PLATFORM_LABELS } from "./supplier-url";
import { VALIDATION_LIMITS as LIMITS, vk, type ValidationKey } from "./validation-messages";

/**
 * Validation at the system boundary (forms, API). Everything downstream trusts these types.
 * Messages are keys of the server-messages dictionary (see ./validation-messages): the edge localizes them.
 */

const distributionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), value: z.number().nonnegative() }),
  z
    .object({
      type: z.literal("triangular"),
      min: z.number().nonnegative(),
      mode: z.number().nonnegative(),
      max: z.number().nonnegative(),
    })
    .refine((d) => d.min <= d.mode && d.mode <= d.max, { message: vk("distribution.order") }),
]);

/** Refuses control characters (tab and line breaks aside) and lone surrogates, which storage cannot keep. */
function safeText(forbiddenMessage: ValidationKey) {
  return z
    .string()
    // `abort` stops the chain here: without it a value made only of a forbidden character would also
    // fail `.min()` after the overwrite, and the form would show that last, misleading issue.
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(value) && value.isWellFormed(), {
      message: forbiddenMessage,
      abort: true,
    });
}

function userText(
  min: number,
  max: number,
  minMessage: ValidationKey | undefined,
  forbiddenMessage: ValidationKey,
  maxMessage?: ValidationKey,
) {
  return safeText(forbiddenMessage)
    .overwrite((value) => value.replace(/[\t\n\r]+/g, " ").trim())
    .min(min, minMessage)
    .max(max, maxMessage);
}

const extraTermSchema = z.object({
  language: z.enum(LANGUAGE_CODES),
  term: userText(2, 80, undefined, vk("extraTerm.forbidden")),
});

/**
 * Supplier product page, recognised offline. Short links and non-web addresses are refused with the parser's
 * guidance; an address that is not a supplier page is kept as typed (nothing is ever fetched from it), so
 * views link only to `parseSupplierUrl(...).canonicalUrl`, never to this text. A blank value means no address.
 */
const supplierUrlSchema = safeText(vk("supplierUrl.forbidden"))
  .trim()
  .max(LIMITS.supplierUrlMax, { message: vk("supplierUrl.tooLong"), abort: true })
  .superRefine((value, ctx) => {
    if (value === "") return;
    // A web address never holds whitespace: prose or a broken paste is refused instead of stored.
    if (/\s/.test(value)) {
      ctx.addIssue({ code: "custom", message: vk("supplierUrl.whitespace") });
      return;
    }
    const parsed = parseSupplierUrl(value);
    if (parsed.kind === "short_link") ctx.addIssue({ code: "custom", message: vk("supplierUrl.shortLink") });
    if (parsed.kind === "invalid") {
      ctx.addIssue({ code: "custom", message: SUPPLIER_URL_ISSUE[parsed.reason], params: { platform: parsed.platform ? SUPPLIER_PLATFORM_LABELS[parsed.platform] : "" } });
    }
  })
  .transform((value) => (value === "" ? undefined : value));

const SUPPLIER_URL_ISSUE = {
  malformed: vk("supplierUrl.malformed"),
  not_web: vk("supplierUrl.notWeb"),
  not_product: vk("supplierUrl.notProduct"),
} as const;

type AmountField = "sellingPrice" | "supplierPrice" | "shippingCost" | "landedCost";

/** A euro amount typed by the owner. Each message names its field: the form shows the prices as one group. */
const amount = (field: AmountField) =>
  z.number({ error: vk(`${field}.notNumber`) }).max(LIMITS.maxAmountEur, vk(`${field}.tooLarge`));

const economicsSchema = z
  .object({
    /** Single input currency for now. TODO: per-country FX conversion (ECB reference rates). */
    currency: z.literal("EUR"),
    /** Intended selling price. */
    sellingPrice: amount("sellingPrice").positive(vk("sellingPrice.notPositive")).optional(),
    /** Supplier unit price. */
    supplierPrice: amount("supplierPrice").positive(vk("supplierPrice.notPositive")).optional(),
    /** Shipping cost to the customer, per unit. */
    shippingCost: amount("shippingCost").nonnegative(vk("shippingCost.negative")).optional(),
    targetMarginPct: z
      .number({ error: vk("targetMargin.notNumber") })
      .min(LIMITS.targetMarginMinPct, vk("targetMargin.range"))
      .max(LIMITS.targetMarginMaxPct, vk("targetMargin.range"))
      .optional(),
    /** Pre-V1 alias: one unit cost, product and delivery together. Above 0, since it can stand for the supplier price. */
    landedCost: amount("landedCost").positive(vk("landedCost.notPositive")).optional(),
  })
  // A pre-V1 landed cost already includes delivery: it stands for the supplier price, with no shipping on top.
  // A typed shipping cost would be dropped by that reading, so it is refused rather than silently replaced.
  .superRefine((economics, ctx) => {
    if (economics.landedCost !== undefined && economics.supplierPrice === undefined && (economics.shippingCost ?? 0) > 0) {
      ctx.addIssue({ code: "custom", path: ["landedCost"], message: vk("landedCost.withShipping") });
    }
  })
  .transform((economics) =>
    economics.landedCost !== undefined && economics.supplierPrice === undefined
      ? { ...economics, supplierPrice: economics.landedCost, shippingCost: 0 }
      : economics,
  );

export const analysisInputSchema = z.object({
  productName: userText(LIMITS.productNameMin, LIMITS.productNameMax, vk("productName.tooShort"), vk("productName.forbidden")),
  supplierUrl: supplierUrlSchema.optional(),
  /** Free text typed by the owner, never inferred. */
  category: userText(
    LIMITS.categoryMin,
    LIMITS.categoryMax,
    vk("category.tooShort"),
    vk("category.forbidden"),
    vk("category.tooLong"),
  ).optional(),
  inputLanguage: z.enum(LANGUAGE_CODES).default("fr"),
  /** Translations / synonyms supplied by the user — the only trusted multilingual terms today. */
  extraTerms: z.array(extraTermSchema).max(40).default([]),
  countries: z
    .array(z.enum(COUNTRY_CODES))
    .min(1, vk("countries.none"))
    .max(COUNTRY_CODES.length)
    .transform((list) => [...new Set(list)]),
  /** Real data only. Stored pre-V1 analyses may still say `mock`: they are read back, never re-validated. */
  dataMode: z
    .literal("live", { error: (issue) => (issue.input === "mock" ? vk("dataMode.mockRemoved") : vk("dataMode.unknown")) })
    .default("live"),
  /** Country the goods ship from, for import duties. Without it, duties stay DATA_INSUFFICIENT. */
  originCountry: z.enum(ORIGIN_CODES).optional(),
  /** Customs code typed by the user (4 to 10 digits); overrides the tariff search. */
  hsCode: z
    .string()
    .transform((v) => v.replace(/[\s.]/g, ""))
    .pipe(z.string().regex(/^\d{4,10}$/, vk("hsCode.format")))
    .optional(),
  economics: economicsSchema.default({ currency: "EUR" }),
  assumptionOverrides: z.partialRecord(z.enum(ASSUMPTION_KEYS), distributionSchema).default({}),
});

export type AnalysisInput = z.output<typeof analysisInputSchema>;
export type AnalysisInputRaw = z.input<typeof analysisInputSchema>;
