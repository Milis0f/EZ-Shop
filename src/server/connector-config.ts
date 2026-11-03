import "server-only";
import { headers } from "next/headers";
import { envValue } from "@/config/vault-values";
import { connectorFields, type EnvEditorAccess, type FieldState } from "@/config/connector-fields";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { ProviderMeta } from "@/providers/contracts";
import { isLoopbackHost } from "./local-access";

export { isLoopbackHost };

const currentValue = (name: string): string | undefined => envValue(name);

export function fieldStates(meta: Pick<ProviderMeta, "id" | "requiredEnv">): FieldState[] {
  // Only names, optionality and secrecy are read here: they do not depend on the language.
  return connectorFields(meta, DEFAULT_LOCALE).map((f) => {
    const value = currentValue(f.name);
    return { name: f.name, optional: f.optional, set: value !== undefined, ...(value !== undefined && !f.secret ? { value } : {}) };
  });
}

/** The request was made on this machine: what only the owner may see (their store, their ads) is read then. */
export async function isLocalRequest(): Promise<boolean> {
  return isLoopbackHost((await headers()).get("host") ?? "");
}

/**
 * Settings are edited from this computer only, in development and in production alike: EZ-Shop is a
 * local app (the future desktop app runs a production build), and the proxy refuses any other host.
 * Secrets go to the system's credential store (src/server/secrets), not to a hosting configuration.
 */
export async function getEnvEditorAccess(): Promise<EnvEditorAccess> {
  const host = (await headers()).get("host") ?? "";
  if (!isLoopbackHost(host)) {
    return { enabled: false, reason: "Modification possible uniquement depuis cette machine (localhost)." };
  }
  return { enabled: true };
}
