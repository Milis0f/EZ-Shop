"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "@/i18n/server";
import { releaseLocalAiEngine } from "@/server/ai/engine";
import { hasModelFile } from "@/server/ai/installer";
import { forgetMachine } from "@/server/ai/machine";
import { aiModel, isAiModelId, modelPathFor } from "@/server/ai/models";
import { updateEnvLocal, type EnvUpdate } from "@/server/env-file";
import { checkRateLimit } from "@/server/rate-limit";
import { localizedEditorAccess } from "../connectors/editor-access";

type SettingResult = { readonly ok: boolean; readonly reason?: string };

/** Writes AI settings to .env.local and applies them to the running server; values never come from the page unchecked. */
async function saveAiSettings(updates: readonly EnvUpdate[], scope: string): Promise<SettingResult> {
  const access = await localizedEditorAccess(await getLocale());
  if (!access.enabled) return { ok: false, reason: access.reason };
  const limit = checkRateLimit(`settings:${scope}`, 10, 60_000);
  if (!limit.allowed) return { ok: false };
  try {
    await updateEnvLocal(updates, "Local AI");
  } catch (error: unknown) {
    console.error(`[settings:${scope}] .env.local could not be written:`, error instanceof Error ? error.message : "unknown error");
    return { ok: false };
  }
  for (const { key, value } of updates) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/** Turns the local AI on or off for this computer (LOCAL_AI_ENABLED in .env.local). The model file stays. */
export async function setAiEnabled(enabled: boolean): Promise<SettingResult> {
  return saveAiSettings([{ key: "LOCAL_AI_ENABLED", value: enabled === true ? "true" : "false" }], "ai");
}

/**
 * Uses another model of the catalogue, already downloaded: LOCAL_AI_MODEL_PATH points to it and the
 * model in memory is freed, so the next reading loads the new one.
 */
export async function setAiModel(id: string): Promise<SettingResult> {
  if (!isAiModelId(id) || !(await hasModelFile(id))) return { ok: false };
  const result = await saveAiSettings([{ key: "LOCAL_AI_MODEL_PATH", value: modelPathFor(aiModel(id)) }], "model");
  if (result.ok) {
    await releaseLocalAiEngine();
    forgetMachine();
  }
  return result;
}

/** Lets the model use the graphics card, or keeps it on the processor only (LOCAL_AI_GPU). */
export async function setAiGpu(mode: string): Promise<SettingResult> {
  if (mode !== "auto" && mode !== "off") return { ok: false };
  const result = await saveAiSettings([{ key: "LOCAL_AI_GPU", value: mode }], "gpu");
  if (result.ok) {
    await releaseLocalAiEngine();
    forgetMachine();
  }
  return result;
}
