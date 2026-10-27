import { describe, expect, it } from "vitest";
import { collectNumbers, extractNumbers, findUnsupportedNumbers } from "./number-guard";

const values = (text: string) => extractNumbers(text).map((t) => t.value);
const NNBSP = " ";
const NBSP = " ";

describe("extractNumbers", () => {
  it("reads integers, decimals with a comma or a dot, and percentages", () => {
    expect(values("803 recherches, 12,2 % par an, 0.5 de ratio, 45 %")).toEqual(["803", "12.2", "0.5", "45"]);
  });

  it("reads French thousands grouped with a space, a no-break space or a narrow no-break space", () => {
    expect(values(`1 234 annonces, 12${NBSP}345 vues, 1${NNBSP}234${NNBSP}567 lecteurs, 1 234,5 €`)).toEqual(["1234", "12345", "1234567", "1234.5"]);
  });

  it("reads dotted thousands only in the unambiguous form with two groups or more", () => {
    expect(values("1.234.567 vues et 1.234 de ratio")).toEqual(["1234567", "1.234"]);
  });

  it("keeps the sign of signed values, including the Unicode minus", () => {
    expect(extractNumbers("−12,2 % puis -3 puis +4,5")).toEqual([
      { raw: "−12,2", value: "12.2", sign: "-" },
      { raw: "-3", value: "3", sign: "-" },
      { raw: "+4,5", value: "4.5", sign: "+" },
    ]);
  });

  it("does not read a hyphen between digits or after a letter as a minus sign", () => {
    expect(extractNumbers("2026-10 et P10-P90").map((t) => [t.value, t.sign])).toEqual([
      ["2026", null],
      ["10", null],
      ["10", null],
      ["90", null],
    ]);
  });

  it("never merges a number glued to a letter with the next one", () => {
    expect(values("P50 340 commandes")).toEqual(["50", "340"]);
  });

  it("does not merge a space-separated group that is not exactly three digits", () => {
    expect(values("entre 12 et 25, 3 1234")).toEqual(["12", "25", "3", "1234"]);
  });

  it("still counts digits inside words and ordinals", () => {
    expect(values("le 1er pays, la 3e semaine, Galaxy S24")).toEqual(["1", "3", "24"]);
  });

  it("ignores a trailing dot or comma at the end of a sentence", () => {
    expect(values("Score de 62. Confiance de 45, faible.")).toEqual(["62", "45"]);
  });

  it("treats zero without a sign", () => {
    expect(extractNumbers("-0 %")).toEqual([{ raw: "-0", value: "0", sign: null }]);
  });
});

describe("findUnsupportedNumbers", () => {
  const facts = collectNumbers("Recherches : 1 234 par mois. Tendance : -12,2 % par an. Score 62 sur 100. Marge 803 €.");

  it("accepts numbers of the facts written in any supported format", () => {
    expect(findUnsupportedNumbers(`1234 recherches, 1${NNBSP}234 aussi, baisse de 12,2 %, −12.2 %, 62/100, 803 €`, facts)).toEqual([]);
  });

  it("returns the numbers that are not in the facts, as written and once each", () => {
    expect(findUnsupportedNumbers("Environ 1 500 ventes, 12 % de marge, 1 500 encore, 62 sur 100", facts)).toEqual(["1 500", "12"]);
  });

  it("refuses a rounded value that the facts do not hold", () => {
    expect(findUnsupportedNumbers("une baisse de 12 % par an", facts)).toEqual(["12"]);
  });

  it("refuses a sign the facts contradict, but accepts an unsigned rewording", () => {
    expect(findUnsupportedNumbers("+12,2 % par an", facts)).toEqual(["+12,2"]);
    expect(findUnsupportedNumbers("une baisse de 12,2 % par an", facts)).toEqual([]);
  });

  it("accepts a sign the facts never wrote when the value is there", () => {
    expect(findUnsupportedNumbers("+62 points", facts)).toEqual([]);
  });

  it("returns nothing for a text without numbers", () => {
    expect(findUnsupportedNumbers("Données insuffisantes pour conclure.", facts)).toEqual([]);
  });

  it("refuses everything when the facts hold no number", () => {
    expect(findUnsupportedNumbers("3 pays", new Set())).toEqual(["3"]);
  });
});

describe("findUnsupportedNumbers with Unicode numerals", () => {
  const allowed = collectNumbers("99 %", "+5 %", "-24,2 %", "1 234");

  it("reads full-width, mathematical, circled and superscript digits as ASCII", () => {
    expect(findUnsupportedNumbers("９９ %", allowed)).toEqual([]);
    expect(findUnsupportedNumbers("１２ %", allowed)).toEqual(["12"]);
    expect(findUnsupportedNumbers("\u{1D7CF}\u{1D7D0} lecteurs", allowed)).toEqual(["12"]);
    expect(findUnsupportedNumbers("⑫ mois", allowed)).toEqual(["12"]);
    expect(findUnsupportedNumbers("x³", allowed)).toEqual(["3"]);
  });

  it("refuses numerals it cannot read (Arabic-Indic, Devanagari)", () => {
    expect(findUnsupportedNumbers("٩٩ %", allowed)).toEqual(["٩٩"]);
    expect(findUnsupportedNumbers("१२ %", allowed)).toEqual(["१२"]);
  });

  it("reads a vulgar fraction as its digits", () => {
    expect(findUnsupportedNumbers("½", allowed)).toEqual(["1", "2"]);
  });

  it("treats Unicode dashes and full-width signs as signs", () => {
    for (const minus of ["–", "‐", "‑", "‒", "﹣", "－"]) {
      expect(findUnsupportedNumbers(`${minus}5 %`, allowed)).toEqual([`${minus.normalize("NFKC")}5`]);
    }
    expect(findUnsupportedNumbers("＋24,2 %", allowed)).toEqual(["+24,2"]);
  });

  it("reads a figure space as a thousands separator", () => {
    expect(extractNumbers("1 234").map((t) => t.value)).toEqual(["1234"]);
    expect(findUnsupportedNumbers("1 234 annonces", allowed)).toEqual([]);
  });
});

describe("findUnsupportedNumbers and labels", () => {
  const allowed = collectNumbers("9", "-24,2 %");

  it("ignores the percentile names, the scale after a number, the fixed windows and the index range", () => {
    expect(findUnsupportedNumbers("confiance de 9 sur 100, soit 9/100", allowed)).toEqual([]);
    expect(findUnsupportedNumbers("les P10, P50 et P90", allowed)).toEqual([]);
    expect(findUnsupportedNumbers("-24,2 % sur les 12 derniers mois", allowed)).toEqual([]);
    expect(findUnsupportedNumbers("un indice de 0 à 100", allowed)).toEqual([]);
  });

  it("still checks the same digits when they are a claim", () => {
    expect(findUnsupportedNumbers("une marge de 100 %", allowed)).toEqual(["100"]);
    expect(findUnsupportedNumbers("12 % de croissance", allowed)).toEqual(["12"]);
    expect(findUnsupportedNumbers("90 % des ventes", allowed)).toEqual(["90"]);
    expect(findUnsupportedNumbers("9 sur 1000", allowed)).toEqual(["1000"]);
  });
});
