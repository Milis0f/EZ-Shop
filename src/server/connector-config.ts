import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/config/env";
import { connectorFields, type EnvEditorAccess, type FieldState } from "@/config/connector-fields";
import { DEFAULT_LOCALE } from "@/i18n/config";
import type { ProviderMeta } from "@/providers/contracts";

const currentValue = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export function fieldStates(meta: Pick<ProviderMeta, "id" | "requiredEnv">): FieldState[] {
  // Only names, optionality and secrecy are read here: they do not depend on the language.
  return connectorFields(meta, DEFAULT_LOCALE).map((f) => {
    const value = currentValue(f.name);
    return { name: f.name, optional: f.optional, set: value !== undefined, ...(value !== undefined && !f.secret ? { value } : {}) };
  });
}

/** localhost, *.localhost, 127.0.0.0/8 and ::1, with or without a port. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  const name = h.startsWith("[") ? h.slice(1, h.indexOf("]")) : h.split(":")[0];
  return name === "localhost" || name.endsWith(".localhost") || name === "::1" || /^127(?:\.\d{1,3}){3}$/.test(name);
}

/**
 * Writing .env.local from the browser is a local-development convenience only: never in production,
 * and only for requests addressed to this machine (Next.js also rejects cross-origin server actions).
 */
export async function getEnvEditorAccess(): Promise<EnvEditorAccess> {
  if (getEnv().NODE_ENV === "production") {
    return { enabled: false, reason: "Désactivé en production : renseigne ces variables dans la configuration de l'hébergeur." };
  }
  const host = (await headers()).get("host") ?? "";
  if (!isLoopbackHost(host)) {
    return { enabled: false, reason: "Modification possible uniquement depuis cette machine (localhost)." };
  }
  return { enabled: true };
}
