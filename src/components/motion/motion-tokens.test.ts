import { describe, expect, it } from "vitest";
import { cubicBezier, motionDuration, motionEasing, parseCssTime, parseCubicBezier } from "./motion-tokens";

describe("parseCssTime", () => {
  it("reads milliseconds and seconds", () => {
    expect(parseCssTime("480ms")).toBe(480);
    expect(parseCssTime(" 140ms ")).toBe(140);
    expect(parseCssTime("0.24s")).toBeCloseTo(240);
    expect(parseCssTime(".5S")).toBeCloseTo(500);
  });

  it("refuses anything that is not a non-negative time", () => {
    expect(parseCssTime("")).toBeNull();
    expect(parseCssTime("fast")).toBeNull();
    expect(parseCssTime("480")).toBeNull();
    expect(parseCssTime("-20ms")).toBeNull();
  });
});

describe("parseCubicBezier", () => {
  it("reads the token syntax, with or without spaces and leading zeros", () => {
    expect(parseCubicBezier("cubic-bezier(0.2, 0.8, 0.2, 1)")).toEqual([0.2, 0.8, 0.2, 1]);
    expect(parseCubicBezier(" cubic-bezier(.34,1.56,.64,1) ")).toEqual([0.34, 1.56, 0.64, 1]);
  });

  it("refuses keywords, malformed values and x outside [0, 1]", () => {
    expect(parseCubicBezier("ease-out")).toBeNull();
    expect(parseCubicBezier("cubic-bezier(0.2, 0.8, 0.2)")).toBeNull();
    expect(parseCubicBezier("cubic-bezier(a, 0.8, 0.2, 1)")).toBeNull();
    expect(parseCubicBezier("cubic-bezier(1.2, 0.8, 0.2, 1)")).toBeNull();
  });
});

describe("cubicBezier", () => {
  it("pins both ends", () => {
    const ease = cubicBezier(0.2, 0.8, 0.2, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it("is the identity for the linear curve", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(linear(t)).toBeCloseTo(t, 5);
  });

  it("matches the browser's ease-out decelerating shape, monotonically", () => {
    const ease = cubicBezier(0.2, 0.8, 0.2, 1);
    expect(ease(0.5)).toBeGreaterThan(0.8);
    let previous = 0;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const value = ease(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("overshoots for the spring token", () => {
    const spring = cubicBezier(0.34, 1.56, 0.64, 1);
    const peak = Math.max(...Array.from({ length: 19 }, (_, i) => spring((i + 1) / 20)));
    expect(peak).toBeGreaterThan(1);
  });
});

describe("token readers outside the browser", () => {
  it("fall back to the values of globals.css", () => {
    expect(motionDuration("fast")).toBe(140);
    expect(motionDuration("base")).toBe(240);
    expect(motionDuration("slow")).toBe(480);
    expect(motionEasing("out")(0.5)).toBeCloseTo(cubicBezier(0.2, 0.8, 0.2, 1)(0.5), 6);
  });
});
