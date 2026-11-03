/**
 * The system's own credential store for EZ-Shop's secrets: Windows Credential Manager, macOS Keychain,
 * the Secret Service on Linux (through @napi-rs/keyring, MIT). One entry per variable, under the
 * service "EZ-Shop". When the system has no usable store (a Linux without a Secret Service, a locked
 * keychain), the vault says so and the app keeps .env.local, as before.
 *
 * No `server-only`: the server start (instrumentation) loads the secrets before the app graph exists.
 * Values are never logged; errors are reported by their name only.
 */

import { vaultValues } from "@/config/vault-values";

export const VAULT_SERVICE = "EZ-Shop";
const PROBE_ACCOUNT = "__ez_shop_probe__";

/** The few operations of an entry the vault needs; the keyring's AsyncEntry in the app, a fake in tests. */
export interface VaultEntry {
  setPassword(value: string): Promise<void>;
  getPassword(): Promise<string | null>;
  deleteCredential(): Promise<boolean>;
}

export type EntryFactory = (service: string, account: string) => VaultEntry;

export interface SecretVault {
  /** Whether the system store answered a write, a read and a delete of a probe entry. */
  available(): Promise<boolean>;
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** Where the secrets live on this system, for the settings page. */
  readonly kind: "windows" | "macos" | "linux" | "other";
}

const kindOf = (platform: string): SecretVault["kind"] => (platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform === "linux" ? "linux" : "other");

export function createVault(entry: EntryFactory, platform: string = process.platform): SecretVault {
  let probed: Promise<boolean> | null = null;
  const open = (name: string) => entry(VAULT_SERVICE, name);
  return {
    kind: kindOf(platform),
    available() {
      probed ??= (async () => {
        try {
          const probe = open(PROBE_ACCOUNT);
          await probe.setPassword("ok");
          const back = await probe.getPassword();
          await probe.deleteCredential();
          return back === "ok";
        } catch (error: unknown) {
          console.error("[vault] system credential store unavailable:", error instanceof Error ? error.name : typeof error);
          return false;
        }
      })();
      return probed;
    },
    get: (name) => open(name).getPassword(),
    set: (name, value) => open(name).setPassword(value),
    async remove(name) {
      await open(name).deleteCredential();
    },
  };
}

/** The app's vault, on the system store; created on first use (the native module loads then). */
let shared: SecretVault | null = null;
export async function systemVault(): Promise<SecretVault> {
  if (shared) return shared;
  try {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    shared = createVault((service, account) => new AsyncEntry(service, account));
  } catch (error: unknown) {
    console.error("[vault] keyring module not loaded:", error instanceof Error ? error.name : typeof error);
    const none: VaultEntry = {
      setPassword: async () => Promise.reject(new Error("no keyring")),
      getPassword: async () => null,
      deleteCredential: async () => false,
    };
    shared = createVault(() => none);
  }
  return shared;
}

/**
 * At the server start: every secret saved in the vault is kept in memory, where `getEnv` and the
 * connector pages read it when the environment leaves the variable empty (.env.local still wins, as
 * development expects).
 */
export async function loadVaultIntoEnv(names: readonly string[], vault: SecretVault, kept: Map<string, string> = vaultValues()): Promise<number> {
  if (!(await vault.available())) return 0;
  let loaded = 0;
  for (const name of names) {
    try {
      const value = await vault.get(name);
      if (value) {
        kept.set(name, value);
        loaded += 1;
      }
    } catch (error: unknown) {
      console.error("[vault] a secret could not be read:", error instanceof Error ? error.name : typeof error);
    }
  }
  return loaded;
}
