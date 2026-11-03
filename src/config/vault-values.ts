/**
 * The secrets read from the system's credential store, kept in memory for the server's life. The dev
 * server reloads .env.local into process.env when the file changes and would drop a secret that moved
 * to the vault: reading through `envValue` keeps it. A value set in the environment still wins.
 */

const globalForVault = globalThis as unknown as { __ezShopVaultValues?: Map<string, string> };

export const vaultValues = (): Map<string, string> => (globalForVault.__ezShopVaultValues ??= new Map());

export function envValue(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  return value ? value : vaultValues().get(name);
}
