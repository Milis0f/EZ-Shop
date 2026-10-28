import { parseSupplierUrl, type SupplierPlatform, type SupplierUrl } from "@/domain/supplier-url";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { t } from "@/i18n/translate";

/** Display names of the supplier platforms, as the owner knows them. */
export const PLATFORM_LABELS: Readonly<Record<SupplierPlatform, string>> = {
  aliexpress: "AliExpress",
  temu: "Temu",
  alibaba: "Alibaba",
  "1688": "1688",
};

/** Ids longer than this are shortened in the chip; the full id stays in the default name and the title. */
const CHIP_ID_DIGITS = 7;
const PRODUCT_NAME_MAX = 80;

/** What the search capsule (or the advanced link field) holds, as the form needs it. */
export type SupplierInput =
  | { readonly kind: "empty" }
  /** Plain text: a product name. */
  | { readonly kind: "name" }
  /** A recognised product page: posted as `supplierUrl`, the name defaults to `defaultName`. */
  | { readonly kind: "product"; readonly chipLabel: string; readonly defaultName: string; readonly productId: string }
  /** An address that cannot be used as is (short link, not a product page, not web): its guidance, localized. */
  | { readonly kind: "guidance"; readonly message: string };

/** « AliExpress, item 1005006… »: the platform and the start of a long product id. */
export function supplierChipLabel(platform: SupplierPlatform, productId: string, locale: Locale): string {
  const id = productId.length > CHIP_ID_DIGITS + 3 ? `${productId.slice(0, CHIP_ID_DIGITS)}…` : productId;
  return t(messagesFor("home", locale).supplier.chip, { platform: PLATFORM_LABELS[platform], id });
}

/** « AliExpress product 1005006… » in full, used as the product name until the owner types one. */
export function defaultProductName(platform: SupplierPlatform, productId: string, locale: Locale): string {
  return t(messagesFor("home", locale).supplier.defaultName, { platform: PLATFORM_LABELS[platform], id: productId }).slice(0, PRODUCT_NAME_MAX);
}

/** The guidance for an address that cannot be used, from the parser's reason code. */
function guidanceFor(parsed: Extract<SupplierUrl, { kind: "short_link" | "invalid" }>, locale: Locale): string {
  const m = messagesFor("home", locale).supplier;
  if (parsed.kind === "short_link") return m.shortLink;
  switch (parsed.reason) {
    case "malformed":
      return m.malformed;
    case "not_web":
      return m.notWeb;
    case "not_product":
      return t(m.notProduct, { platform: parsed.platform ? PLATFORM_LABELS[parsed.platform] : "" });
  }
}

/** Reads a typed value offline (nothing is fetched): a name, a supplier product page or an unusable address. */
export function readSupplierInput(value: string, locale: Locale): SupplierInput {
  if (value.trim() === "") return { kind: "empty" };
  const parsed = parseSupplierUrl(value);
  switch (parsed.kind) {
    case "not_a_supplier_url":
      return { kind: "name" };
    case "product":
      return {
        kind: "product",
        productId: parsed.productId,
        chipLabel: supplierChipLabel(parsed.platform, parsed.productId, locale),
        defaultName: defaultProductName(parsed.platform, parsed.productId, locale),
      };
    case "short_link":
    case "invalid":
      return { kind: "guidance", message: guidanceFor(parsed, locale) };
  }
}

/**
 * Whether a value looks like an address at all. Plain text stays a name; anything address-like is posted as
 * `supplierUrl` so the server gives its own message, even for a host the parser does not know.
 */
export function isAddressLike(value: string): boolean {
  const text = value.trim();
  return text !== "" && !/\s/.test(text) && (/^[a-z][a-z0-9+.-]*:/i.test(text) || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+[/?#]/i.test(text));
}

/** The name the form posts: what the owner typed, else the default name of a recognised page, else nothing. */
export function resolveProductName(typedName: string, input: SupplierInput): string {
  const typed = typedName.trim();
  if (typed !== "") return typed;
  return input.kind === "product" ? input.defaultName : "";
}
