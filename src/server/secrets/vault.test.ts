import { describe, expect, it } from "vitest";
import { createVault, loadVaultIntoEnv, type EntryFactory } from "./vault";
import { moveSecretsToVault, saveSettings, secretsStatus, VaultWriteError, type SettingsDeps } from "./settings-store";

/** A credential store in memory, like the system's: one entry per service and account. */
function fakeStore(options: { broken?: boolean; forgets?: boolean } = {}) {
  const entries = new Map<string, string>();
  const factory: EntryFactory = (service, account) => ({
    setPassword: async (value) => {
      if (options.broken) throw new Error("locked");
      if (!options.forgets) entries.set(`${service}/${account}`, value);
    },
    getPassword: async () => entries.get(`${service}/${account}`) ?? null,
    deleteCredential: async () => entries.delete(`${service}/${account}`),
  });
  return { entries, factory };
}

function deps(vaultOptions: { broken?: boolean; forgets?: boolean } = {}, file: Record<string, string> = {}) {
  const store = fakeStore(vaultOptions);
  const vault = createVault(store.factory, "win32");
  const writes: Array<{ key: string; value: string | null }> = [];
  const env = { NODE_ENV: "test" } as NodeJS.ProcessEnv;
  const kept = new Map<string, string>();
  const d: SettingsDeps = {
    vault: async () => vault,
    writeEnv: async (updates) => {
      for (const u of updates) {
        writes.push(u);
        if (u.value === null) delete file[u.key];
        else file[u.key] = u.value;
      }
    },
    readEnv: async () => ({ ...file }),
    env,
    kept,
  };
  return { store, vault, writes, env, kept, file, d };
}

describe("system credential store", () => {
  it("says it is usable only after a probe entry was written, read and removed", async () => {
    const ok = fakeStore();
    expect(await createVault(ok.factory, "win32").available()).toBe(true);
    expect(ok.entries.size).toBe(0);
    expect(await createVault(fakeStore({ broken: true }).factory, "linux").available()).toBe(false);
  });

  it("puts the secrets in the vault and the rest in .env.local, with no plain copy left", async () => {
    const t = deps({}, { GOOGLE_ADS_CLIENT_SECRET: "old-plain" });
    await saveSettings([{ key: "GOOGLE_ADS_CLIENT_SECRET", value: "s3cret" }, { key: "GOOGLE_ADS_CUSTOMER_ID", value: "123-456-7890" }], "Google Ads", t.d);
    expect(t.store.entries.get("EZ-Shop/GOOGLE_ADS_CLIENT_SECRET")).toBe("s3cret");
    expect(t.file).toEqual({ GOOGLE_ADS_CUSTOMER_ID: "123-456-7890" });
    expect(t.env.GOOGLE_ADS_CLIENT_SECRET).toBe("s3cret");
    expect(t.kept.get("GOOGLE_ADS_CLIENT_SECRET")).toBe("s3cret");
  });

  it("keeps everything in .env.local when the system has no usable store", async () => {
    const t = deps({ broken: true });
    await saveSettings([{ key: "YOUTUBE_API_KEY", value: "AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }], "YouTube", t.d);
    expect(t.file.YOUTUBE_API_KEY).toBe("AIzaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
  });

  it("never drops a secret the vault did not keep", async () => {
    const t = deps({ forgets: true }, { EBAY_CLIENT_SECRET: "plain" });
    // The probe itself fails when nothing is kept: the vault is taken as unavailable, the file stays.
    await saveSettings([{ key: "EBAY_CLIENT_SECRET", value: "new" }], "eBay", t.d);
    expect(t.file.EBAY_CLIENT_SECRET).toBe("new");
  });

  it("moves the plain secrets of .env.local into the vault, each only once it reads back", async () => {
    const t = deps({}, { SHOPIFY_CLIENT_SECRET: "shp-secret", SHOPIFY_STORE_DOMAIN: "x.myshopify.com", META_ADS_ACCESS_TOKEN: "EAAtoken" });
    expect(await secretsStatus(t.d)).toMatchObject({ kind: "windows", available: true, inVault: 0, inFile: 2 });
    expect(await moveSecretsToVault(t.d)).toEqual({ moved: 2, kept: 0 });
    expect(t.file).toEqual({ SHOPIFY_STORE_DOMAIN: "x.myshopify.com" });
    expect(await secretsStatus(t.d)).toMatchObject({ inVault: 2, inFile: 0 });
  });

  it("loads the vault's secrets at the start, a value set in the environment still winning", async () => {
    const t = deps();
    await t.vault.set("TIKTOK_CLIENT_SECRET", "from-vault");
    const kept = new Map<string, string>();
    expect(await loadVaultIntoEnv(["TIKTOK_CLIENT_SECRET", "TIKTOK_CLIENT_KEY"], t.vault, kept)).toBe(1);
    expect(kept.get("TIKTOK_CLIENT_SECRET")).toBe("from-vault");
  });

  it("reports a store that loses a value as a failed save", async () => {
    const t = deps();
    const vault = await t.d.vault();
    await vault.available();
    const lossy = { ...t.d, vault: async () => ({ ...vault, get: async () => null }) };
    await expect(saveSettings([{ key: "ALIEXPRESS_APP_SECRET", value: "x" }], "AliExpress", lossy)).rejects.toBeInstanceOf(VaultWriteError);
  });
});
