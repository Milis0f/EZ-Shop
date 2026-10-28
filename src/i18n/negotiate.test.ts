import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale } from "./config";
import { parseAcceptLanguage, resolveLocale } from "./negotiate";

describe("parseAcceptLanguage", () => {
  it("keeps supported languages, best quality first, without region", () => {
    expect(parseAcceptLanguage("de-DE,es;q=0.7,fr-CH;q=0.9,en;q=0.5")).toEqual(["fr", "es", "en"]);
  });

  it("keeps header order on equal quality and drops duplicates", () => {
    expect(parseAcceptLanguage("es-MX, es-ES, fr")).toEqual(["es", "fr"]);
  });

  it("ignores q=0, malformed entries and empty headers", () => {
    expect(parseAcceptLanguage("fr;q=0, es;q=abc, en;q=0.1")).toEqual(["en"]);
    expect(parseAcceptLanguage("")).toEqual([]);
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage("*")).toEqual([]);
  });
});

describe("resolveLocale", () => {
  it("prefers the cookie over Accept-Language", () => {
    expect(resolveLocale({ cookie: "es", acceptLanguage: "fr-FR,fr;q=0.9" })).toBe("es");
  });

  it("falls back to Accept-Language when the cookie is missing or unknown", () => {
    expect(resolveLocale({ cookie: undefined, acceptLanguage: "fr-FR,fr;q=0.9" })).toBe("fr");
    expect(resolveLocale({ cookie: "de", acceptLanguage: "es" })).toBe("es");
  });

  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(resolveLocale({})).toBe("en");
    expect(resolveLocale({ cookie: "", acceptLanguage: "de-DE,ja;q=0.8" })).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts only the three interface languages", () => {
    expect(["en", "fr", "es"].every(isLocale)).toBe(true);
    expect(["EN", "de", "", null, 3].some(isLocale)).toBe(false);
  });
});
