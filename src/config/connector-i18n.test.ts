import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { connectorFields, envFields, validateEnvValue } from "./connector-fields";
import { CONNECTOR_GROUP_ORDER, connectorGroups, connectorGuides } from "./connector-guides";

describe("connector texts by language", () => {
  const reference = envFields("en");

  for (const locale of LOCALES) {
    it(`${locale}: every variable keeps its rules and has a label, help and reject messages`, () => {
      const fields = envFields(locale);
      expect(Object.keys(fields).sort()).toEqual(Object.keys(reference).sort());
      for (const [name, spec] of Object.entries(fields)) {
        expect(spec.label.trim(), name).not.toBe("");
        expect(spec.help.trim(), name).not.toBe("");
        expect(spec.secret, name).toBe(reference[name]?.secret);
        expect(String(spec.pattern), name).toBe(String(reference[name]?.pattern));
        expect(Boolean(spec.patternHint), name).toBe(Boolean(spec.pattern));
        for (const reject of spec.rejects ?? []) expect(reject.message.trim(), name).not.toBe("");
      }
    });

    it(`${locale}: every guide step only names known variables, groups in page order`, () => {
      for (const guide of Object.values(connectorGuides(locale))) {
        expect(guide.brings.trim()).not.toBe("");
        for (const step of guide.steps) for (const field of step.fields ?? []) expect(envFields(locale)).toHaveProperty(field);
      }
      expect(connectorGroups(locale).map((g) => g.id)).toEqual(CONNECTOR_GROUP_ORDER);
    });
  }

  it("reports validation problems in the requested language", () => {
    const token = envFields("en").GOOGLE_ADS_REFRESH_TOKEN;
    expect(token).toBeDefined();
    expect(validateEnvValue(token!, "   ", "en")).toEqual({ ok: false, error: "Empty value." });
    expect(validateEnvValue(token!, "   ", "es")).toEqual({ ok: false, error: "Valor vacío." });
    expect(validateEnvValue(token!, "   ", "fr")).toEqual({ ok: false, error: "Valeur vide." });
    expect(validateEnvValue(token!, "4/0Afake", "en")).toMatchObject({ ok: false, error: expect.stringContaining("authorisation code") });
  });

  it("describes a connector's fields in the requested language", () => {
    const meta = { id: "youtube-data", requiredEnv: ["YOUTUBE_API_KEY"] } as const;
    expect(connectorFields(meta, "en")[0]?.label).toBe("Google Cloud API key");
    expect(connectorFields(meta, "fr")[0]?.label).toBe("Clé API Google Cloud");
  });
});
