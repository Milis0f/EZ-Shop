import { describe, expect, it } from "vitest";
import { formatCompact, formatDate, formatDecimal, formatInt, formatMoney, formatPct, formatRatioPct } from "./format";

const plain = (s: string) => s.replace(/[  ]/g, " ");

/** The legacy helpers default to French, so screens not yet translated print exactly what they did. */
describe("lib/format", () => {
  it("keeps the French output when no locale is given", () => {
    expect(formatInt(1234567)).toBe(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(1234567));
    expect(formatDecimal(3.14159)).toBe("3,1");
    expect(plain(formatCompact(12_345))).toBe("12,3 k");
    expect(formatCompact(7.25)).toBe("7,3");
    expect(formatCompact(123.6)).toBe("124");
    expect(formatPct(12.34)).toBe("12,3 %");
    expect(formatPct(12.34, true)).toBe("+12,3 %");
    expect(formatRatioPct(0.5)).toBe("50 %");
    expect(plain(formatMoney(4.5))).toBe("4,50 €");
    expect(plain(formatMoney(1500, "USD"))).toBe("1 500 $US");
    const iso = "2026-10-28T09:05:00Z";
    expect(formatDate(iso)).toBe(new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
  });

  it("is identical when given fr explicitly", () => {
    expect(formatPct(-2.5, false, "fr")).toBe(formatPct(-2.5));
    expect(formatMoney(99, "EUR", "fr")).toBe(formatMoney(99));
    expect(formatCompact(50_000, "fr")).toBe(formatCompact(50_000));
  });

  it("follows another locale when asked", () => {
    expect(formatPct(12.34, true, "en")).toBe("+12.3%");
    expect(formatMoney(1500, "EUR", "en")).toBe("€1,500");
    expect(formatInt(1500, "es")).toBe("1500");
  });
});
