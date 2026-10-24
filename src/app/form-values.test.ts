import { describe, expect, it } from "vitest";
import { parseFormNumber } from "./form-values";

describe("parseFormNumber", () => {
  it.each([null, "", "   ", new File([], "prix.txt")])("reads an empty or non-text field as no value (%j)", (value) => {
    expect(parseFormNumber(value)).toBeUndefined();
  });

  it.each([
    ["29", 29],
    [" 29 ", 29],
    ["29,90", 29.9],
    ["29.90", 29.9],
    ["1 299,90", 1299.9],
    ["1 299,90", 1299.9],
    ["1 299,90", 1299.9],
    ["-1", -1],
  ])("reads a French or plain decimal %j as %d", (value, expected) => {
    expect(parseFormNumber(value)).toBe(expected);
  });

  it.each(["0x10", "1e3", "Infinity", "29 €", "1.299,90", ".5", "5.", "1,2,3", "douze"])(
    "refuses %j as NaN so the schema explains it in French",
    (value) => {
      expect(parseFormNumber(value)).toBeNaN();
    },
  );
});
