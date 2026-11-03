import { z } from "zod";
import type { StoreOrder, StoreProduct, StoreShop } from "@/domain/store";

/**
 * Shapes of the Shopify Admin GraphQL answers EZ-Shop reads, kept lenient: a missing field becomes null
 * rather than an error, and money arrives as decimal strings.
 */

const money = z
  .object({ shopMoney: z.object({ amount: z.union([z.string(), z.number()]) }) })
  .nullish()
  .transform((m) => {
    const value = m ? Number(m.shopMoney.amount) : 0;
    return Number.isFinite(value) ? value : 0;
  });

const shopSchema = z.object({
  name: z.string(),
  myshopifyDomain: z.string(),
  currencyCode: z.string(),
  taxesIncluded: z.boolean().nullish(),
  plan: z.object({ displayName: z.string().nullish() }).nullish(),
  shipsToCountries: z.array(z.string()).nullish(),
});

export function parseShop(raw: unknown): StoreShop | null {
  const parsed = shopSchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  return {
    name: s.name,
    domain: s.myshopifyDomain,
    currency: s.currencyCode,
    plan: s.plan?.displayName ?? null,
    taxesIncluded: s.taxesIncluded ?? null,
    // "REST_OF_WORLD" is a Shopify placeholder, not a country.
    shipsTo: (s.shipsToCountries ?? []).filter((code) => /^[A-Z]{2}$/.test(code)).sort(),
  };
}

const scopesSchema = z.object({ accessScopes: z.array(z.object({ handle: z.string() })) });

/** The access scopes the store granted to the app; none when Shopify did not say. */
export function parseScopes(raw: unknown): string[] {
  const parsed = scopesSchema.safeParse(raw);
  return parsed.success ? parsed.data.accessScopes.map((scope) => scope.handle).sort() : [];
}

const priceSchema = z
  .object({ amount: z.union([z.string(), z.number()]) })
  .nullish()
  .transform((p) => {
    const value = p ? Number(p.amount) : Number.NaN;
    return Number.isFinite(value) ? value : null;
  });

const productSchema = z.object({
  id: z.string(),
  title: z.string(),
  handle: z.string(),
  status: z.string().default("ACTIVE"),
  vendor: z.string().nullish(),
  productType: z.string().nullish(),
  totalInventory: z.number().nullish(),
  tracksInventory: z.boolean().nullish(),
  onlineStoreUrl: z.string().nullish(),
  priceRangeV2: z.object({ minVariantPrice: priceSchema, maxVariantPrice: priceSchema }).nullish(),
});

export function parseProducts(nodes: readonly unknown[]): StoreProduct[] {
  return nodes.flatMap((node) => {
    const parsed = productSchema.safeParse(node);
    if (!parsed.success) return [];
    const p = parsed.data;
    return [
      {
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        vendor: p.vendor?.trim() || null,
        productType: p.productType?.trim() || null,
        priceMin: p.priceRangeV2?.minVariantPrice ?? null,
        priceMax: p.priceRangeV2?.maxVariantPrice ?? null,
        inventory: p.tracksInventory === false ? null : (p.totalInventory ?? null),
        url: p.onlineStoreUrl ?? null,
      },
    ];
  });
}

const lineSchema = z.object({
  title: z.string().default(""),
  quantity: z.number().default(0),
  originalTotalSet: money,
  product: z.object({ id: z.string() }).nullish(),
});

const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  test: z.boolean().default(false),
  cancelledAt: z.string().nullish(),
  shippingAddress: z.object({ countryCodeV2: z.string().nullish() }).nullish(),
  totalPriceSet: money,
  totalTaxSet: money,
  totalShippingPriceSet: money,
  totalRefundedSet: money,
  lineItems: z.object({ nodes: z.array(z.unknown()) }).nullish(),
});

export function parseOrders(nodes: readonly unknown[]): StoreOrder[] {
  return nodes.flatMap((node) => {
    const parsed = orderSchema.safeParse(node);
    if (!parsed.success) return [];
    const o = parsed.data;
    const country = o.shippingAddress?.countryCodeV2 ?? null;
    return [
      {
        id: o.id,
        createdAt: o.createdAt,
        country: country && /^[A-Z]{2}$/.test(country) ? country : null,
        total: o.totalPriceSet,
        tax: o.totalTaxSet,
        shipping: o.totalShippingPriceSet,
        refunded: o.totalRefundedSet,
        cancelled: Boolean(o.cancelledAt),
        test: o.test,
        lines: (o.lineItems?.nodes ?? []).flatMap((line) => {
          const l = lineSchema.safeParse(line);
          return l.success ? [{ productId: l.data.product?.id ?? null, title: l.data.title, quantity: l.data.quantity, total: l.data.originalTotalSet }] : [];
        }),
      },
    ];
  });
}

const connectionSchema = z.object({
  nodes: z.array(z.unknown()),
  pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
});

export function parseConnection(raw: unknown): { readonly nodes: readonly unknown[]; readonly next: string | null } | null {
  const parsed = connectionSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { nodes: parsed.data.nodes, next: parsed.data.pageInfo.hasNextPage ? (parsed.data.pageInfo.endCursor ?? null) : null };
}

const errorSchema = z.array(z.object({ message: z.string().optional(), path: z.array(z.union([z.string(), z.number()])).optional(), extensions: z.object({ code: z.string().optional() }).optional() }));

/** Whether Shopify refused the order addresses (protected customer data) rather than the whole query. */
export function refusedAddresses(errors: unknown): boolean {
  const parsed = errorSchema.safeParse(errors);
  if (!parsed.success) return false;
  return parsed.data.some(
    (e) =>
      (e.path ?? []).some((part) => part === "shippingAddress") ||
      /shippingAddress|protected customer data|customer data/i.test(e.message ?? "") ||
      e.extensions?.code === "ACCESS_DENIED",
  );
}
