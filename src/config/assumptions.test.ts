import { describe, expect, it } from "vitest";
import { ASSUMPTION_KEYS } from "@/domain/assumption";
import { buildAssumptions, localizeAssumption } from "./assumptions";

describe("localizeAssumption", () => {
  const defaults = buildAssumptions();

  it("keeps the stored French texts byte for byte in French", () => {
    for (const key of ASSUMPTION_KEYS) {
      expect(localizeAssumption(defaults[key], "fr")).toEqual(defaults[key]);
    }
  });

  it("changes only the texts, never the key, unit, distribution or origin", () => {
    for (const key of ASSUMPTION_KEYS) {
      const stored = defaults[key];
      const localized = localizeAssumption(stored, "en");
      expect(localized).toEqual({ ...stored, label: localized.label, description: localized.description, rationale: localized.rationale });
      expect(localized.label).not.toBe(stored.label);
      expect([localized.label, localized.description, localized.rationale].every((s) => s.trim() !== "")).toBe(true);
    }
  });

  it("uses the user rationale for an overridden value, in French as stored", () => {
    const overridden = buildAssumptions({ conversion_rate: { type: "fixed", value: 0.02 } }).conversion_rate;
    expect(localizeAssumption(overridden, "fr").rationale).toBe(overridden.rationale);
    expect(localizeAssumption(overridden, "es").rationale).not.toBe(overridden.rationale);
  });
});
