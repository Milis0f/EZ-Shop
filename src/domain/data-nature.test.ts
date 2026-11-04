import { describe, expect, it } from "vitest";
import { coverageOfStatus, isFactual, sourced } from "./data-nature";

const base = { metric: "m", unit: null, nature: "published", source: "x", sourceUrl: null, observedAt: "2026-11-04T00:00:00Z", periodStart: null, periodEnd: null, attribution: null } as const;

describe("sourced", () => {
  it("keeps an available value", () => {
    expect(sourced({ ...base, value: 4.2, coverage: "available" })).toMatchObject({ value: 4.2, coverage: "available", nature: "published" });
  });

  it("never turns a failure into a zero", () => {
    expect(sourced({ ...base, value: 0, coverage: "rate_limited" })).toMatchObject({ value: null, coverage: "rate_limited", nature: "unknown" });
  });

  it("calls an available answer without a value insufficient", () => {
    expect(sourced({ ...base, value: Number.NaN, coverage: "available" })).toMatchObject({ value: null, coverage: "insufficient_data", nature: "unknown" });
  });
});

describe("coverageOfStatus", () => {
  it("maps refusals, absence and limits", () => {
    expect(coverageOfStatus(403)).toBe("permission_required");
    expect(coverageOfStatus(402)).toBe("paid_required");
    expect(coverageOfStatus(404)).toBe("not_covered");
    expect(coverageOfStatus(429)).toBe("rate_limited");
    expect(coverageOfStatus(500)).toBe("blocked");
  });
});

describe("isFactual", () => {
  it("separates readings from models and signs", () => {
    expect(isFactual("observed")).toBe(true);
    expect(isFactual("declared")).toBe(true);
    expect(isFactual("ezshop_estimated")).toBe(false);
    expect(isFactual("inferred")).toBe(false);
  });
});
