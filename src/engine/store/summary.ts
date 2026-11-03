import type { AdsRow, CountrySales, MonthSales, ProductSales, StoreOrder, StoreSnapshot, StoreSummary } from "@/domain/store";

/**
 * Plain arithmetic on what the store reported: sums, shares and lists. No estimate, no model: every
 * figure can be found again in the store's own admin.
 */

/** At or below this many units, a product that sells is short of stock. */
export const LOW_STOCK_UNITS = 5;
const MONTHS = 12;

const round = (value: number): number => Math.round(value * 100) / 100;

function monthsBack(readAt: string, count: number): string[] {
  const end = new Date(readAt);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (count - 1 - i), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** The orders a summary counts: never the cancelled ones, and test orders only in a test store. */
export function countedOrders(orders: readonly StoreOrder[]): { readonly counted: readonly StoreOrder[]; readonly testOnly: boolean } {
  const live = orders.filter((o) => !o.cancelled);
  const real = live.filter((o) => !o.test);
  // A store with nothing but test orders is being tried out: showing them is more useful than zeros.
  const testOnly = real.length === 0 && live.length > 0;
  return { counted: testOnly ? live : real, testOnly };
}

export function summariseStore(snapshot: StoreSnapshot): StoreSummary {
  const { counted, testOnly } = countedOrders(snapshot.orders);
  const net = (o: StoreOrder) => o.total - o.refunded;
  const revenue = counted.reduce((sum, o) => sum + net(o), 0);

  const countries = new Map<string | null, { orders: number; revenue: number; taxes: number; shipping: number; units: number }>();
  const products = new Map<string, { units: number; revenue: number; orders: number; countries: Map<string, number> }>();
  for (const order of counted) {
    const row = countries.get(order.country) ?? { orders: 0, revenue: 0, taxes: 0, shipping: 0, units: 0 };
    const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
    countries.set(order.country, {
      orders: row.orders + 1,
      revenue: row.revenue + net(order),
      taxes: row.taxes + order.tax,
      shipping: row.shipping + order.shipping,
      units: row.units + units,
    });
    const seen = new Set<string>();
    for (const line of order.lines) {
      if (!line.productId) continue;
      const product = products.get(line.productId) ?? { units: 0, revenue: 0, orders: 0, countries: new Map<string, number>() };
      product.units += line.quantity;
      product.revenue += line.total;
      if (!seen.has(line.productId)) product.orders += 1;
      seen.add(line.productId);
      if (order.country) product.countries.set(order.country, (product.countries.get(order.country) ?? 0) + line.quantity);
      products.set(line.productId, product);
    }
  }

  const byCountry: CountrySales[] = [...countries]
    .map(([country, row]) => ({
      country,
      orders: row.orders,
      revenue: round(row.revenue),
      taxes: round(row.taxes),
      shipping: round(row.shipping),
      units: row.units,
      share: revenue > 0 ? row.revenue / revenue : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);

  const byMonth: MonthSales[] = monthsBack(snapshot.readAt, MONTHS).map((month) => {
    const inMonth = counted.filter((o) => o.createdAt.slice(0, 7) === month);
    return { month, orders: inMonth.length, revenue: round(inMonth.reduce((sum, o) => sum + net(o), 0)) };
  });

  const withSales: ProductSales[] = snapshot.products
    .map((product) => {
      const sold = products.get(product.id);
      return {
        ...product,
        units: sold?.units ?? 0,
        revenue: round(sold?.revenue ?? 0),
        orders: sold?.orders ?? 0,
        countries: sold ? [...sold.countries].sort((a, b) => b[1] - a[1]).map(([country]) => country) : [],
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.title.localeCompare(b.title));

  const sellingCountries = new Set(byCountry.map((row) => row.country).filter((c): c is string => c !== null));
  const active = withSales.filter((p) => p.status === "ACTIVE");

  return {
    currency: snapshot.shop.currency,
    orders: counted.length,
    revenue: round(revenue),
    averageOrder: counted.length > 0 ? round(revenue / counted.length) : null,
    taxes: round(counted.reduce((sum, o) => sum + o.tax, 0)),
    shipping: round(counted.reduce((sum, o) => sum + o.shipping, 0)),
    refunds: round(counted.reduce((sum, o) => sum + o.refunded, 0)),
    units: counted.reduce((sum, o) => sum + o.lines.reduce((s, line) => s + line.quantity, 0), 0),
    byCountry,
    byMonth,
    products: withSales,
    // Hidden countries say nothing about where the store sells: no list rather than a wrong one.
    shipsWithoutSales: snapshot.countriesHidden ? [] : snapshot.shop.shipsTo.filter((country) => !sellingCountries.has(country)),
    lowStock: active.filter((p) => p.units > 0 && p.inventory !== null && p.inventory <= LOW_STOCK_UNITS).map((p) => p.id),
    unsold: active.filter((p) => p.units === 0).map((p) => p.id),
    cancelled: snapshot.orders.filter((o) => o.cancelled).length,
    testOrders: snapshot.orders.filter((o) => o.test).length,
    testOnly,
  };
}

/** Return on ad spend of an ads row, when the platform reported purchase values. */
export function roas(row: AdsRow): number | null {
  return row.purchaseValue !== null && row.spend > 0 ? row.purchaseValue / row.spend : null;
}

/** What a sale cost in ads, when the platform reported purchases. */
export function costPerPurchase(row: AdsRow): number | null {
  return row.purchases !== null && row.purchases > 0 ? row.spend / row.purchases : null;
}
