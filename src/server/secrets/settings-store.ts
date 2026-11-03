import "server-only";
import { SECRET_ENV_NAMES } from "@/config/connector-fields";
import { vaultValues } from "@/config/vault-values";
import { readEnvLocal, updateEnvLocal, type EnvUpdate } from "../env-file";
import { systemVault, type SecretVault } from "./vault";

/**
 * Where a setting is saved: a secret (key, client secret, token) in the system's credential store
 * when it has one, everything else in .env.local. A secret saved to the vault leaves .env.local, so no
 * plain copy remains. Without a usable vault, all goes to .env.local as before. The running server
 * gets the new values at once.
 */

export interface SettingsDeps {
  readonly vault: () => Promise<SecretVault>;
  readonly writeEnv: (updates: readonly EnvUpdate[], section: string) => Promise<void>;
  readonly readEnv: () => Promise<Record<string, string>>;
  readonly env: NodeJS.ProcessEnv;
  readonly kept: Map<string, string>;
}

const DEFAULT_DEPS: SettingsDeps = { vault: systemVault, writeEnv: updateEnvLocal, readEnv: readEnvLocal, env: process.env, kept: vaultValues() };
const isSecret = (name: string) => SECRET_ENV_NAMES.includes(name);

export class VaultWriteError extends Error {
  override readonly name = "VaultWriteError";
}

export async function saveSettings(updates: readonly EnvUpdate[], section: string, deps: SettingsDeps = DEFAULT_DEPS): Promise<{ readonly inVault: number }> {
  const vault = await deps.vault();
  const useVault = updates.some((u) => isSecret(u.key)) && (await vault.available());
  const secrets = useVault ? updates.filter((u) => isSecret(u.key)) : [];
  for (const { key, value } of secrets) {
    if (value === null) {
      await vault.remove(key);
      continue;
    }
    await vault.set(key, value);
    // Read back before the plain copy goes: a store that dropped it must not cost the key.
    if ((await vault.get(key)) !== value) throw new VaultWriteError("The credential store did not keep the value.");
  }
  const toFile = [...updates.filter((u) => !secrets.includes(u)), ...secrets.map((u) => ({ key: u.key, value: null }))];
  if (toFile.length > 0) await deps.writeEnv(toFile, section);
  for (const { key, value } of updates) {
    if (value === null) delete deps.env[key];
    else deps.env[key] = value;
    if (secrets.some((s) => s.key === key)) {
      if (value === null) deps.kept.delete(key);
      else deps.kept.set(key, value);
    }
  }
  return { inVault: secrets.filter((s) => s.value !== null).length };
}

export interface SecretsStatus {
  readonly kind: SecretVault["kind"];
  readonly available: boolean;
  /** Secrets kept by the system store. */
  readonly inVault: number;
  /** Secrets still written in plain text in .env.local. */
  readonly inFile: number;
}

export async function secretsStatus(deps: SettingsDeps = DEFAULT_DEPS): Promise<SecretsStatus> {
  const vault = await deps.vault();
  const available = await vault.available();
  const file = await deps.readEnv();
  let inVault = 0;
  if (available) {
    for (const name of SECRET_ENV_NAMES) if (await vault.get(name).catch(() => null)) inVault += 1;
  }
  return { kind: vault.kind, available, inVault, inFile: SECRET_ENV_NAMES.filter((name) => file[name]).length };
}

/**
 * Moves the secrets written in .env.local into the vault, one by one: each is written, read back, and
 * only then removed from the file. A secret the vault does not keep stays in the file.
 */
export async function moveSecretsToVault(deps: SettingsDeps = DEFAULT_DEPS): Promise<{ readonly moved: number; readonly kept: number }> {
  const vault = await deps.vault();
  if (!(await vault.available())) return { moved: 0, kept: 0 };
  const file = await deps.readEnv();
  const moved: string[] = [];
  let kept = 0;
  for (const name of SECRET_ENV_NAMES) {
    const value = file[name];
    if (!value) continue;
    try {
      await vault.set(name, value);
      if ((await vault.get(name)) === value) {
        moved.push(name);
        deps.kept.set(name, value);
      } else kept += 1;
    } catch (error: unknown) {
      console.error("[vault] a secret was kept in .env.local:", error instanceof Error ? error.name : typeof error);
      kept += 1;
    }
  }
  if (moved.length > 0) await deps.writeEnv(moved.map((key) => ({ key, value: null })), "Secrets");
  return { moved: moved.length, kept };
}
