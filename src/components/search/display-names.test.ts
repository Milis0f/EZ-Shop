import { describe, expect, it } from "vitest";
import { countryName, inputLanguageFor, languageName, originName } from "./display-names";

describe("display names", () => {
  it("keeps the French reference names", () => {
    expect(countryName("GB", "fr")).toBe("Royaume-Uni");
    expect(originName("CN", "fr")).toBe("Chine");
    expect(languageName("de", "fr")).toBe("Allemand");
  });

  it("names countries and languages in English and Spanish", () => {
    expect(countryName("GB", "en")).toBe("United Kingdom");
    expect(countryName("GB", "es")).toBe("Reino Unido");
    expect(originName("HK", "en")).toBe("Hong Kong");
    expect(languageName("de", "en")).toBe("German");
    expect(languageName("de", "es")).toBe("Alemán");
  });

  it("assumes the name is typed in the interface language", () => {
    expect(inputLanguageFor("en")).toBe("en");
    expect(inputLanguageFor("es")).toBe("es");
    expect(inputLanguageFor("fr")).toBe("fr");
  });
});

describe("display names, the same on the server and in the browser", () => {
  it("never depends on the runtime's own country and language data", async () => {
    const real = Intl.DisplayNames;
    // A runtime whose data names Korea differently, as a browser can: the page must not change.
    (Intl as { DisplayNames: unknown }).DisplayNames = class {
      of(): string {
        return "WRONG";
      }
    };
    try {
      const { ORIGIN_CODES } = await import("@/domain/origin");
      const { COUNTRY_CODES, LANGUAGE_CODES } = await import("@/domain/country");
      const { originCountryName } = await import("@/components/data/labels");
      const { countryName: reportCountry, languageName: reportLanguage } = await import("@/engine/report/localize");
      for (const locale of ["fr", "en", "es"] as const) {
        for (const code of ORIGIN_CODES) {
          expect(originName(code, locale)).not.toBe("WRONG");
          expect(originCountryName(code, locale)).not.toBe("WRONG");
        }
        for (const code of COUNTRY_CODES) {
          expect(countryName(code, locale)).not.toBe("WRONG");
          expect(reportCountry(code, locale)).not.toBe("WRONG");
        }
        for (const code of LANGUAGE_CODES) {
          expect(languageName(code, locale)).not.toBe("WRONG");
          expect(reportLanguage(code, locale)).not.toBe("WRONG");
        }
      }
      expect(originName("KR", "en")).toBe("South Korea");
    } finally {
      (Intl as { DisplayNames: unknown }).DisplayNames = real;
    }
  });
});
