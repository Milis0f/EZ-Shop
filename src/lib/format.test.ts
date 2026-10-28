import { describe, expect, it } from "vitest";
import { formatCompact, formatDate, formatDecimal, formatInt, formatMoney, formatPct, formatRatioPct } from "@/i18n/format";

const plain = (s: string) => s.replace(/[  ]/g, " ");

/** French output is byte-for-byte what the app printed before i18n. */
describe("French formatting", () => {
  it("keeps the output printed before i18n", () => {
    expect(formatInt(1234567, "fr")).toBe(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(1234567));
    expect(formatDecimal(3.14159, "fr")).toBe("3,1");
    expect(plain(formatCompact(12_345, "fr"))).toBe("12,3 k");
    expect(formatCompact(7.25, "fr")).toBe("7,3");
    expect(formatCompact(123.6, "fr")).toBe("124");
    expect(formatPct(12.34, "fr")).toBe("12,3 %");
    expect(formatPct(12.34, "fr", { signed: true })).toBe("+12,3 %");
    expect(formatRatioPct(0.5, "fr")).toBe("50 %");
    expect(plain(formatMoney(4.5, "fr"))).toBe("4,50 €");
    expect(plain(formatMoney(1500, "fr", "USD"))).toBe("1 500 $US");
    const iso = "2026-10-28T09:05:00Z";
    expect(formatDate(iso, "fr")).toBe(new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
  });

  it("follows another locale when asked", () => {
    expect(formatPct(12.34, "en", { signed: true })).toBe("+12.3%");
    expect(formatMoney(1500, "en")).toBe("€1,500");
    expect(formatInt(1500, "es")).toBe("1500");
  });
});
