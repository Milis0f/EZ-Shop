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
