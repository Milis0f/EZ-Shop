import { describe, expect, it } from "vitest";
import { createFormatters, formatCompact, formatDate, formatInt, formatMoney, formatNumber, formatPct, formatPeriodEnd, formatRatioPct } from "./format";

/** Intl uses non-breaking spaces in French; normalise them to compare readable strings. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("format helpers per locale", () => {
  it("groups digits the locale's way", () => {
    expect(formatInt(1234567.4, "en")).toBe("1,234,567");
    expect(plain(formatInt(1234567.4, "fr"))).toBe("1 234 567");
    expect(formatInt(1234567.4, "es")).toBe("1.234.567");
  });

  it("formats compact values with one decimal below 10", () => {
    expect(formatCompact(4.25, "en")).toBe("4.3");
    expect(formatCompact(4.25, "fr")).toBe("4,3");
    expect(formatCompact(25_000, "en")).toBe("25K");
    expect(plain(formatCompact(25_000, "fr"))).toBe("25 k");
    expect(plain(formatCompact(25_000, "es"))).toBe("25 mil");
  });

  it("writes percentages with the locale's spacing", () => {
    expect(formatPct(12.34, "en")).toBe("12.3%");
    expect(formatPct(12.34, "en", { signed: true })).toBe("+12.3%");
    expect(formatPct(-3, "en", { signed: true })).toBe("-3%");
    expect(formatPct(12.34, "fr")).toBe("12,3 %");
    expect(formatPct(12.34, "es")).toBe("12,3 %");
    expect(formatRatioPct(0.125, "en")).toBe("12.5%");
  });

  it("formats money with cents only below 10", () => {
    expect(formatMoney(4.5, "en")).toBe("€4.50");
    expect(formatMoney(1234.4, "en")).toBe("€1,234");
    expect(plain(formatMoney(1234.4, "fr"))).toBe("1 234 €");
    expect(plain(formatMoney(4.5, "es"))).toBe("4,50 €");
    expect(formatMoney(12, "en", "USD")).toBe("US$12");
  });

  it("puts the day before the month in all three locales", () => {
    const iso = "2026-10-28T12:05:00Z";
    expect(formatDate(iso, "en")).toMatch(/^28 Oct 2026, \d{2}:\d{2}$/);
    expect(formatDate(iso, "fr")).toMatch(/^28 oct\. 2026, \d{2}:\d{2}$/);
    expect(formatDate(iso, "es")).toMatch(/^28 oct 2026, \d{1,2}:\d{2}$/);
  });

  it("passes Intl options through and binds to a locale", () => {
    expect(formatNumber(0.5, "en", { style: "percent" })).toBe("50%");
    const f = createFormatters("es");
    expect(f.locale).toBe("es");
    expect(f.pct(5)).toBe(formatPct(5, "es"));
    expect(f.money(20)).toBe(formatMoney(20, "es"));
  });
});

describe("formatPeriodEnd", () => {
  it("formats stored period ends as dates in the locale", () => {
    expect(formatPeriodEnd("2025", "en")).toBe("2025");
    expect(formatPeriodEnd("2026-10-24", "en")).toBe("24 Oct 2026");
    expect(formatPeriodEnd("2026-10", "fr")).toMatch(/oct\.? 2026/);
    expect(formatPeriodEnd("last-12-months", "es")).toBe("last-12-months");
  });
});
