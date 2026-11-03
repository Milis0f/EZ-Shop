"use server";

import { revalidatePath } from "next/cache";
import { isLocalRequest } from "@/server/connector-config";
import { checkRateLimit } from "@/server/rate-limit";
import { moveSecretsToVault } from "@/server/secrets/settings-store";

export type MoveResult = { readonly ok: true; readonly moved: number; readonly kept: number } | { readonly ok: false; readonly error: "remote" | "failed" };

/** Moves the secrets written in .env.local into the system's credential store (Settings → Keys). */
export async function moveSecrets(): Promise<MoveResult> {
  if (!(await isLocalRequest())) return { ok: false, error: "remote" };
  if (!checkRateLimit("secrets:move", 5, 60_000).allowed) return { ok: false, error: "failed" };
  try {
    const result = await moveSecretsToVault();
    revalidatePath("/settings");
    return { ok: true, ...result };
  } catch (error: unknown) {
    console.error("[secrets] move failed", error instanceof Error ? error.name : typeof error);
    return { ok: false, error: "failed" };
  }
}
