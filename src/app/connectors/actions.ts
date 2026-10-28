"use server";

import { revalidatePath } from "next/cache";
import { connectorFields, validateEnvValue } from "@/config/connector-fields";
import { REAL_PROVIDER_METAS } from "@/providers/registry";
import { checkConnector } from "@/server/connector-check";
import { getLocale, getMessages } from "@/i18n/server";
import { plural, t } from "@/i18n/translate";
import { updateEnvLocal, type EnvUpdate } from "@/server/env-file";
import { checkRateLimit } from "@/server/rate-limit";
import { localizedEditorAccess } from "./editor-access";
import type { ConnectorFormState, ConnectorTestResult } from "./form-state";

const SAVE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
/** Each test spends real API quota: a few per minute is plenty to fix a setting. */
const TEST_RATE_LIMIT = { limit: 6, windowMs: 60_000 } as const;

/** Tries the saved credentials against the real API, step by step. Nothing is written. */
export async function testConnectorConnection(providerId: string): Promise<ConnectorTestResult> {
  const locale = await getLocale();
  const m = (await getMessages("connectors", locale)).actions;
  const access = await localizedEditorAccess(locale);
  if (!access.enabled) return { ok: false, message: access.reason };

  const limit = checkRateLimit("connectors:test", TEST_RATE_LIMIT.limit, TEST_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { ok: false, message: t(m.tooManyTests, { seconds: limit.retryAfterSeconds }) };

  const meta = REAL_PROVIDER_METAS.find((m) => m.id === providerId);
  if (!meta) return { ok: false, message: m.unknownSource };
  const steps = await checkConnector(meta.id, locale);
  if (!steps) return { ok: false, message: m.testUnavailable };
  return { ok: true, steps, testedAt: new Date().toISOString() };
}

/**
 * Saves a connector's variables to .env.local and applies them to the running server.
 * Only the connector's own variables are accepted; an empty field keeps the current value;
 * values are validated, never logged and never sent back.
 */
export async function saveConnectorConfig(_prev: ConnectorFormState, formData: FormData): Promise<ConnectorFormState> {
  const locale = await getLocale();
  const m = (await getMessages("connectors", locale)).actions;
  const access = await localizedEditorAccess(locale);
  if (!access.enabled) return { status: "error", message: access.reason };

  const limit = checkRateLimit("connectors:save", SAVE_RATE_LIMIT.limit, SAVE_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { status: "error", message: t(m.tooManySaves, { seconds: limit.retryAfterSeconds }) };

  const meta = REAL_PROVIDER_METAS.find((m) => m.id === formData.get("providerId"));
  if (!meta) return { status: "error", message: m.unknownSource };
  const fields = connectorFields(meta, locale);

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
    const checked = validateEnvValue(field, raw, locale);
    if (checked.ok) updates.push({ key: field.name, value: checked.value });
    else fieldErrors[field.name] = checked.error;
  }

  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: m.fixFields, fieldErrors };
  if (updates.length === 0) return { status: "error", message: m.nothingEntered };

  try {
    await updateEnvLocal(updates, meta.name);
  } catch (error: unknown) {
    // The message describes the file system error only; values are never part of it.
    console.error("[saveConnectorConfig] .env.local could not be written:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: m.writeFailed };
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
    message: missing === 0 ? m.savedComplete : plural(locale, missing, m.savedMissing),
  };
}
