import type { DeepMargin } from "@/domain/deep-research";

/**
 * The margin of a product at the owner's selling price, and at a few other prices around it so the
 * report can show where it breaks even. Plain arithmetic on the figures the owner typed.
 */

const STEPS = [0.6, 0.8, 1, 1.2, 1.4, 1.6] as const;
const round = (value: number): number => Math.round(value * 100) / 100;

export function marginOf(sellingPrice: number | undefined, supplierPrice: number | undefined, shippingCost: number | undefined): DeepMargin | null {
  if (!sellingPrice || !supplierPrice || sellingPrice <= 0) return null;
  const landedCost = supplierPrice + (shippingCost ?? 0);
  const at = (price: number) => ({ price: round(price), marginPct: round(((price - landedCost) / price) * 100) });
  return {
    sellingPrice,
    landedCost: round(landedCost),
    margin: round(sellingPrice - landedCost),
    marginPct: at(sellingPrice).marginPct,
    byPrice: STEPS.map((step) => at(sellingPrice * step)),
  };
}
