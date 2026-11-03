import { useSyncExternalStore } from "react";
import { aiInstallStatusSchema, type AiInstallStatus } from "@/domain/web";

/**
 * Install state of the local AI, shared by every button on the page. Asked once on first use, then
 * polled only while a download or a check is running.
 */

const POLL_MS = 1_500;
const ENDPOINT = "/api/ai/install";

let status: AiInstallStatus | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let asked = false;
const listeners = new Set<() => void>();

function publish(next: AiInstallStatus): void {
  status = next;
  listeners.forEach((listener) => listener());
  clearTimeout(timer);
  const busy = (state: string | undefined) => state === "downloading" || state === "verifying";
  if (busy(next.state) || busy(next.download?.phase)) timer = setTimeout(() => void request("GET"), POLL_MS);
}

async function request(method: "GET" | "POST" | "DELETE", model?: string): Promise<void> {
  try {
    const response = await fetch(ENDPOINT, {
      method,
      ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(model ? { model } : {}) }),
    });
    const parsed = aiInstallStatusSchema.safeParse(((await response.json()) as { data?: unknown }).data);
    if (parsed.success) publish(parsed.data);
    else if (method !== "GET") publish({ ...(status ?? EMPTY), state: "failed", error: "network" });
  } catch {
    // The app's own server did not answer. A status read stays silent: nothing is offered without a state.
    if (method !== "GET") publish({ ...(status ?? EMPTY), state: "failed", error: "network" });
  }
}

const EMPTY: AiInstallStatus = { state: "missing", downloadedBytes: 0, totalBytes: 0, error: null };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!asked) {
    asked = true;
    void request("GET");
  }
  return () => listeners.delete(listener);
}

/** Downloads the configured model, or another model of the catalogue named by its id. */
export const startAiInstall = (model?: string): Promise<void> => request("POST", model);
/** Asks the state again, after a setting changed it (the AI turned on or off). */
export const refreshAiInstall = (): Promise<void> => request("GET");
export const stopAiInstall = (): Promise<void> => request("DELETE");

/** Null until the server has answered: no button flashes for an AI that is already there. */
export function useAiInstall(): AiInstallStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => null,
  );
}

/** Tests only. */
export function resetAiInstallStore(): void {
  status = null;
  asked = false;
  clearTimeout(timer);
  listeners.clear();
}
