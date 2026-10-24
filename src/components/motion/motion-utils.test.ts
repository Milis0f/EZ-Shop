import { describe, expect, it } from "vitest";
import { clampPercent, cssVars, isInViewport, nextRadioIndex } from "./motion-utils";

describe("clampPercent", () => {
  it("keeps values inside [0, 100]", () => {
    expect(clampPercent(42.5)).toBe(42.5);
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(150)).toBe(100);
  });

  it("draws nothing for a value that is not a number", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("nextRadioIndex", () => {
  it("moves forward with right and down, wrapping at the end", () => {
    expect(nextRadioIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextRadioIndex(1, "ArrowDown", 3)).toBe(2);
    expect(nextRadioIndex(2, "ArrowRight", 3)).toBe(0);
  });

  it("moves backward with left and up, wrapping at the start", () => {
    expect(nextRadioIndex(2, "ArrowLeft", 3)).toBe(1);
    expect(nextRadioIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("jumps with Home and End", () => {
    expect(nextRadioIndex(1, "Home", 3)).toBe(0);
    expect(nextRadioIndex(1, "End", 3)).toBe(2);
  });

  it("starts from the matching end when nothing is checked", () => {
    expect(nextRadioIndex(-1, "ArrowRight", 3)).toBe(0);
    expect(nextRadioIndex(-1, "ArrowLeft", 3)).toBe(2);
  });

  it("swaps left and right only in right-to-left text", () => {
    expect(nextRadioIndex(0, "ArrowLeft", 3, true)).toBe(1);
    expect(nextRadioIndex(0, "ArrowRight", 3, true)).toBe(2);
    expect(nextRadioIndex(0, "ArrowDown", 3, true)).toBe(1);
  });

  it("ignores other keys and empty groups", () => {
    expect(nextRadioIndex(0, "Enter", 3)).toBeNull();
    expect(nextRadioIndex(0, " ", 3)).toBeNull();
    expect(nextRadioIndex(0, "ArrowRight", 0)).toBeNull();
  });
});

describe("isInViewport", () => {
  const box = (top: number, height: number) => ({ top, bottom: top + height, width: 100, height });

  it("is true when the box overlaps the viewport", () => {
    expect(isInViewport(box(100, 50), 800)).toBe(true);
    expect(isInViewport(box(-40, 50), 800)).toBe(true);
    expect(isInViewport(box(790, 50), 800)).toBe(true);
  });

  it("is false below, above, or for a box with no size", () => {
    expect(isInViewport(box(800, 50), 800)).toBe(false);
    expect(isInViewport(box(-60, 50), 800)).toBe(false);
    expect(isInViewport({ top: 0, bottom: 0, width: 0, height: 0 }, 800)).toBe(false);
  });
});

describe("cssVars", () => {
  it("passes custom properties through untouched", () => {
    expect(cssVars({ "--i": 2, "--ring-color": "var(--craie)" })).toEqual({ "--i": 2, "--ring-color": "var(--craie)" });
  });
});
