import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorFields, ENV_FIELDS, validateEnvValue } from "@/config/connector-fields";
import { REAL_PROVIDER_METAS } from "@/providers/registry";
import { fieldStates, isLoopbackHost } from "./connector-config";
import { formatStep } from "./connector-check";
import { applyEnvUpdates, updateEnvLocal } from "./env-file";

describe("connector fields", () => {
  it("describes every variable a connector requires", () => {
    for (const meta of REAL_PROVIDER_METAS) {
      expect(() => connectorFields(meta, "fr")).not.toThrow();
      expect(connectorFields(meta, "fr").filter((f) => !f.optional).map((f) => f.name)).toEqual(meta.requiredEnv);
    }
  });

  it("accepts real credential shapes and rejects what dotenv would alter", () => {
    const token = { pattern: undefined };
    expect(validateEnvValue(token, "  1//0gAbC-d_e.f~g+h/i=  ", "fr")).toEqual({ ok: true, value: "1//0gAbC-d_e.f~g+h/i=" });
    expect(validateEnvValue(token, "abc$HOME", "fr").ok).toBe(false);
    expect(validateEnvValue(token, 'abc"def', "fr").ok).toBe(false);
    expect(validateEnvValue(token, "abc #comment", "fr").ok).toBe(false);
    expect(validateEnvValue(token, "line1\nline2", "fr").ok).toBe(false);
    expect(validateEnvValue(token, "   ", "fr").ok).toBe(false);
  });

  it("recognises the wrong credential pasted into a field", () => {
    const cloudKey = validateEnvValue(ENV_FIELDS.GOOGLE_ADS_CLIENT_ID, "AIzaSyD-fake-cloud-api-key-000000000000", "fr");
    expect(cloudKey).toMatchObject({ ok: false, error: expect.stringContaining("clé API Google Cloud") });
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_REFRESH_TOKEN, "4/0AfakeAuthCode", "fr")).toMatchObject({ ok: false, error: expect.stringContaining("code d'autorisation") });
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_REFRESH_TOKEN, "ya29.fakeAccess", "fr")).toMatchObject({ ok: false, error: expect.stringContaining("jeton d'accès") });
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_REFRESH_TOKEN, "something-else", "fr").ok).toBe(false);
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_REFRESH_TOKEN, "1//0gFakeRefreshToken", "fr").ok).toBe(true);
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_CLIENT_ID, "123-abc.apps.googleusercontent.com", "fr").ok).toBe(true);
    expect(validateEnvValue(ENV_FIELDS.GOOGLE_ADS_CLIENT_ID, "123-abc", "fr").ok).toBe(false);
  });

  it("checks identifier formats", () => {
    const customer = ENV_FIELDS.GOOGLE_ADS_CUSTOMER_ID;
    expect(validateEnvValue(customer, "123-456-7890", "fr").ok).toBe(true);
    expect(validateEnvValue(customer, "1234567890", "fr").ok).toBe(true);
    expect(validateEnvValue(customer, "12-34", "fr").ok).toBe(false);
    expect(validateEnvValue(ENV_FIELDS.META_GRAPH_API_VERSION, "v23.0", "fr").ok).toBe(true);
    expect(validateEnvValue(ENV_FIELDS.META_GRAPH_API_VERSION, "23", "fr").ok).toBe(false);
  });
});

describe("fieldStates", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("never exposes a secret value, only that it is set", () => {
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "secret-token");
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "123-456-7890");
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "");
    const meta = REAL_PROVIDER_METAS.find((m) => m.id === "google-ads-keyword-planner");
    const states = fieldStates(meta!);
    const byName = Object.fromEntries(states.map((s) => [s.name, s]));
    expect(byName.GOOGLE_ADS_CLIENT_SECRET).toEqual({ name: "GOOGLE_ADS_CLIENT_SECRET", optional: false, set: true });
    expect(byName.GOOGLE_ADS_DEVELOPER_TOKEN).toBeUndefined();
    expect(byName.GOOGLE_ADS_CUSTOMER_ID.value).toBe("123-456-7890");
    expect(byName.GOOGLE_ADS_CLIENT_ID.set).toBe(false);
    expect(JSON.stringify(states)).not.toContain("secret-token");
  });
});

describe("formatStep", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists every saved value with the wrong shape, without showing it", () => {
    vi.stubEnv("GOOGLE_ADS_API_VERSION", "v26");
    vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "AIzaSyD-fake-cloud-api-key-000000000000");
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "GOCSPX-fake");
    vi.stubEnv("GOOGLE_ADS_REFRESH_TOKEN", "not-a-refresh-token");
    vi.stubEnv("GOOGLE_ADS_CUSTOMER_ID", "");
    const meta = REAL_PROVIDER_METAS.find((m) => m.id === "google-ads-keyword-planner")!;
    const step = formatStep(meta, "fr");
    expect(step.status).toBe("error");
    expect(step.items).toEqual([
      expect.stringContaining("ID client OAuth : C'est une clé API Google Cloud"),
      expect.stringContaining("Jeton d'actualisation OAuth : Un jeton d'actualisation Google commence par 1//"),
      "ID du compte Google Ads : manquante.",
    ]);
    expect(JSON.stringify(step)).not.toContain("AIzaSyD-fake");
  });
});

describe("isLoopbackHost", () => {
  it.each(["localhost:3001", "LOCALHOST", "127.0.0.1:3000", "[::1]:3001", "app.localhost:3000"])("accepts %s", (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });
  it.each(["192.168.1.20:3001", "example.com", "localhost.example.com", "", "10.0.0.1"])("rejects %s", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("applyEnvUpdates", () => {
  it("replaces in place, keeps comments, drops duplicates", () => {
    const before = "# comment\nA=1\nGOOGLE_TRENDS_API_KEY=old\nB=2\nexport GOOGLE_TRENDS_API_KEY=dup\n";
    expect(applyEnvUpdates(before, [{ key: "GOOGLE_TRENDS_API_KEY", value: "new" }], "Google Trends")).toBe(
      "# comment\nA=1\nGOOGLE_TRENDS_API_KEY=new\nB=2\n",
    );
  });

  it("groups new keys under the connector's section", () => {
    const first = applyEnvUpdates("A=1\n", [{ key: "TIKTOK_CLIENT_KEY", value: "k" }], "TikTok");
    const second = applyEnvUpdates(`${first}\nZ=9\n`, [{ key: "TIKTOK_CLIENT_SECRET", value: "s" }], "TikTok");
    expect(second).toBe("A=1\n\n# ---- TikTok ----\nTIKTOK_CLIENT_KEY=k\nTIKTOK_CLIENT_SECRET=s\n\nZ=9\n");
  });

  it("drops a section once its last variable is removed, keeps hand-written ones", () => {
    const before = "# header\n\n# ---- Hand ----\n# note\n\n# ---- Trends ----\nGOOGLE_TRENDS_API_KEY=k\n";
    expect(applyEnvUpdates(before, [{ key: "GOOGLE_TRENDS_API_KEY", value: null }], "Trends")).toBe("# header\n\n# ---- Hand ----\n# note\n");
  });

  it("removes a key and ignores removing a missing one", () => {
    expect(applyEnvUpdates("A=1\nB=2\n", [{ key: "A", value: null }, { key: "C", value: null }], "X")).toBe("B=2\n");
  });

  it("refuses a malformed variable name", () => {
    expect(() => applyEnvUpdates("", [{ key: "A=1\nB", value: "x" }], "X")).toThrow();
  });
});

describe("updateEnvLocal", () => {
  it("creates .env.local with a header, then updates it", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ez-env-"));
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      await updateEnvLocal([{ key: "GOOGLE_TRENDS_API_KEY", value: "k1" }], "Google Trends");
      await updateEnvLocal([{ key: "GOOGLE_TRENDS_API_KEY", value: "k2" }], "Google Trends");
      const content = await readFile(path.join(dir, ".env.local"), "utf8");
      expect(content).toBe("# Local secrets for EZ-Shop. Never commit this file.\n\n# ---- Google Trends ----\nGOOGLE_TRENDS_API_KEY=k2\n");
    } finally {
      cwd.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
