import { parseSupplierUrl, type SupplierPlatform } from "@/domain/supplier-url";

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
  /** An address that cannot be used as is (short link, not a product page, not web): its French guidance. */
  | { readonly kind: "guidance"; readonly message: string };

/** « AliExpress, article 1005006… »: the platform and the start of a long product id. */
export function supplierChipLabel(platform: SupplierPlatform, productId: string): string {
  const id = productId.length > CHIP_ID_DIGITS + 3 ? `${productId.slice(0, CHIP_ID_DIGITS)}…` : productId;
  return `${PLATFORM_LABELS[platform]}, article ${id}`;
}

/** « Produit AliExpress 1005006… » in full, used as the product name until the owner types one. */
export function defaultProductName(platform: SupplierPlatform, productId: string): string {
  return `Produit ${PLATFORM_LABELS[platform]} ${productId}`.slice(0, PRODUCT_NAME_MAX);
}

/** Reads a typed value offline (nothing is fetched): a name, a supplier product page or an unusable address. */
export function readSupplierInput(value: string): SupplierInput {
  if (value.trim() === "") return { kind: "empty" };
  const parsed = parseSupplierUrl(value);
  switch (parsed.kind) {
    case "not_a_supplier_url":
      return { kind: "name" };
    case "product":
      return {
        kind: "product",
        productId: parsed.productId,
        chipLabel: supplierChipLabel(parsed.platform, parsed.productId),
        defaultName: defaultProductName(parsed.platform, parsed.productId),
      };
    case "short_link":
    case "invalid":
      return { kind: "guidance", message: parsed.message };
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
