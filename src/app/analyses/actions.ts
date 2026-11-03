"use server";

import { revalidatePath } from "next/cache";
import { HISTORY_KINDS, type HistoryKind } from "@/domain/history";
import { isLocalRequest } from "@/server/connector-config";
import { deleteHistoryEntry } from "@/server/history";
import { checkRateLimit } from "@/server/rate-limit";

export type RemoveResult = { readonly ok: true } | { readonly ok: false; readonly error: "remote" | "failed" };

const LIMIT = { limit: 30, windowMs: 60_000 } as const;

/** Removes one line of the history (after the page asked to confirm). Only from this computer. */
export async function removeHistoryEntry(kind: string, id: string): Promise<RemoveResult> {
  if (!(await isLocalRequest())) return { ok: false, error: "remote" };
  if (!(HISTORY_KINDS as readonly string[]).includes(kind) || typeof id !== "string") return { ok: false, error: "failed" };
  if (!checkRateLimit("history:remove", LIMIT.limit, LIMIT.windowMs).allowed) return { ok: false, error: "failed" };
  try {
    const removed = await deleteHistoryEntry(kind as HistoryKind, id);
    revalidatePath("/analyses");
    revalidatePath("/");
    return removed ? { ok: true } : { ok: false, error: "failed" };
  } catch (error: unknown) {
    console.error("[history] remove failed", error instanceof Error ? error.name : typeof error);
    return { ok: false, error: "failed" };
  }
}
