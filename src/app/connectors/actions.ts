"use server";

import { revalidatePath } from "next/cache";
import { connectorFields, validateEnvValue } from "@/config/connector-fields";
import { REAL_PROVIDER_METAS } from "@/providers/registry";
import { checkConnector } from "@/server/connector-check";
import { getEnvEditorAccess } from "@/server/connector-config";
import { updateEnvLocal, type EnvUpdate } from "@/server/env-file";
import { checkRateLimit } from "@/server/rate-limit";
import type { ConnectorFormState, ConnectorTestResult } from "./form-state";

const SAVE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
/** Each test spends real API quota: a few per minute is plenty to fix a setting. */
const TEST_RATE_LIMIT = { limit: 6, windowMs: 60_000 } as const;

/** Tries the saved credentials against the real API, step by step. Nothing is written. */
export async function testConnectorConnection(providerId: string): Promise<ConnectorTestResult> {
  const access = await getEnvEditorAccess();
  if (!access.enabled) return { ok: false, message: access.reason };

  const limit = checkRateLimit("connectors:test", TEST_RATE_LIMIT.limit, TEST_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { ok: false, message: `Trop de tests d'affilée. Réessaie dans ${limit.retryAfterSeconds} s.` };

  const meta = REAL_PROVIDER_METAS.find((m) => m.id === providerId);
  if (!meta) return { ok: false, message: "Source inconnue." };
  const steps = await checkConnector(meta.id);
  if (!steps) return { ok: false, message: "Le test de connexion n'est pas encore disponible pour cette source." };
  return { ok: true, steps, testedAt: new Date().toISOString() };
}

/**
 * Saves a connector's variables to .env.local and applies them to the running server.
 * Only the connector's own variables are accepted; an empty field keeps the current value;
 * values are validated, never logged and never sent back.
 */
export async function saveConnectorConfig(_prev: ConnectorFormState, formData: FormData): Promise<ConnectorFormState> {
  const access = await getEnvEditorAccess();
  if (!access.enabled) return { status: "error", message: access.reason };

  const limit = checkRateLimit("connectors:save", SAVE_RATE_LIMIT.limit, SAVE_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { status: "error", message: `Trop d'enregistrements. Réessaie dans ${limit.retryAfterSeconds} s.` };

  const meta = REAL_PROVIDER_METAS.find((m) => m.id === formData.get("providerId"));
  if (!meta) return { status: "error", message: "Source inconnue." };
  const fields = connectorFields(meta);

  const toClear = new Set(formData.getAll("clear").map(String));
  const updates: EnvUpdate[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const field of fields) {
    if (toClear.has(field.name)) {
      updates.push({ key: field.name, value: null });
      continue;
    }
    const raw = formData.get(field.name);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const checked = validateEnvValue(field, raw);
    if (checked.ok) updates.push({ key: field.name, value: checked.value });
    else fieldErrors[field.name] = checked.error;
  }

  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: "Corrige les champs signalés, rien n'a été enregistré.", fieldErrors };
  if (updates.length === 0) return { status: "error", message: "Aucune valeur saisie : rien n'a été modifié." };

  try {
    await updateEnvLocal(updates, meta.name);
  } catch (error: unknown) {
    // The message describes the file system error only; values are never part of it.
    console.error("[saveConnectorConfig] .env.local could not be written:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: "Impossible d'écrire .env.local. Vérifie les droits sur le dossier du projet." };
  }

  // Applied to the running server at once; the dev server also reloads .env.local on its own.
  for (const { key, value } of updates) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  revalidatePath("/connectors");
  revalidatePath("/");

  const missing = fields.filter((f) => !f.optional && !process.env[f.name]?.trim()).length;
  return {
    status: "saved",
    complete: missing === 0,
    savedAt: Date.now(),
    message:
      missing === 0
        ? "Enregistré dans .env.local. Toutes les variables obligatoires sont renseignées."
        : `Enregistré dans .env.local. Il reste ${missing} variable${missing > 1 ? "s" : ""} obligatoire${missing > 1 ? "s" : ""} à renseigner.`,
  };
}
