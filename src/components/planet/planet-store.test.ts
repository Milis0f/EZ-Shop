import { describe, expect, it } from "vitest";
import { getPlanetState, reportAnalysis, shownProgress, shownStep, startAnalysis, type PlanetAnalysis } from "./planet-store";

const analysis = (extra: Partial<PlanetAnalysis> = {}): PlanetAnalysis => ({
  product: "gourde",
  countries: ["FR"],
  message: "",
  startedAt: 0,
  expectedMs: 10_000,
  phases: ["terms", "sources", "prices", "scores"],
  progress: null,
  step: null,
  ...extra,
});

describe("the ring around the planet", () => {
  it("estimates a progress that rises, slows down and never closes on its own", () => {
    const a = analysis();
    expect(shownProgress(a, 0)).toBe(0);
    expect(shownProgress(a, 10_000)).toBeGreaterThan(0.8);
    expect(shownProgress(a, 10_000_000)).toBeLessThan(0.93);
    expect(shownProgress(a, 5_000)).toBeLessThan(shownProgress(a, 6_000));
  });

  it("shows the real progress and step once the analysis reports them", () => {
    expect(shownProgress(analysis({ progress: 0.4 }), 999_999)).toBe(0.4);
    expect(shownProgress(analysis({ progress: 1.7 }), 0)).toBe(1);
    expect(shownStep(analysis({ step: "Reading shop X" }), 0.1)).toBe("Reading shop X");
  });

  it("walks through the phases in order while it only estimates", () => {
    expect(shownStep(analysis(), 0)).toBe("terms");
    expect(shownStep(analysis(), 0.5)).toBe("prices");
    expect(shownStep(analysis(), 0.92)).toBe("scores");
    expect(shownStep(analysis({ phases: [] }), 0.5)).toBeNull();
  });

  it("takes what a streaming analysis reports", () => {
    startAnalysis({ product: "x", countries: ["FR"], message: "" }, 0);
    reportAnalysis({ progress: 0.3, step: "Searching the web" });
    expect(getPlanetState().analysis).toMatchObject({ progress: 0.3, step: "Searching the web", phases: [] });
  });
});
