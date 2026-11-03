import "server-only";
import { mkdir, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ServerEnv } from "@/config/env";
import type { AiGpu, AiMachine } from "@/domain/ai-settings";
import { loadedLlama, localAiMemory } from "./engine";
import { MODELS_DIR } from "./models";

/**
 * Reads this computer for the settings page: memory from the system, the graphics card from
 * node-llama-cpp's backend (the loaded model's one when there is one, else a short-lived one freed at
 * once). Kept fifteen seconds, so opening the page twice does not start the backend twice.
 */

const CACHE_MS = 15_000;
const PROBE_TIMEOUT_MS = 10_000;

type Llama = NonNullable<ReturnType<typeof loadedLlama>>;

let kept: { readonly until: number; readonly gpuMode: string; readonly machine: Promise<AiMachine> } | null = null;

async function readGpu(llama: Llama): Promise<AiGpu | null> {
  if (llama.gpu === false) return null;
  const [names, vram] = await Promise.all([llama.getGpuDeviceNames(), llama.getVramState()]);
  return { backend: llama.gpu, names, vramTotal: vram.total, vramUsed: vram.used, vramFree: vram.free, unified: vram.unifiedSize > 0 };
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("probe timeout")), ms);
  });
  return Promise.race([work.finally(() => clearTimeout(timer)), late]);
}

async function probeGpu(): Promise<{ gpu: AiGpu | null; probe: AiMachine["gpuProbe"] }> {
  const running = loadedLlama();
  try {
    if (running && running.gpu !== false) {
      const gpu = await readGpu(running);
      return { gpu, probe: gpu ? "ok" : "none" };
    }
    const { getLlama } = await import("node-llama-cpp");
    // Prebuilt binaries only, as for the model itself; freed as soon as the card is read.
    const llama = await withTimeout(getLlama({ build: "never" }), PROBE_TIMEOUT_MS);
    try {
      const gpu = await readGpu(llama);
      return { gpu, probe: gpu ? "ok" : "none" };
    } finally {
      await llama.dispose().catch(() => undefined);
    }
  } catch (error: unknown) {
    console.error("[ai] graphics card could not be read", error instanceof Error ? error.name : typeof error);
    return { gpu: null, probe: "failed" };
  }
}

async function freeDisk(): Promise<number | null> {
  try {
    const dir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), MODELS_DIR);
    await mkdir(dir, { recursive: true });
    const stats = await statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

async function read(env: ServerEnv): Promise<AiMachine> {
  const cpus = os.cpus();
  const [{ gpu, probe }, ai, diskFree] = await Promise.all([probeGpu(), localAiMemory(), freeDisk()]);
  return {
    ramTotal: os.totalmem(),
    ramFree: os.freemem(),
    cpu: cpus[0]?.model.trim() ?? "?",
    threads: cpus.length,
    gpu,
    gpuProbe: probe,
    ai: ai ? { vram: ai.vram, ram: ai.ram, layers: { onGpu: ai.gpuLayers, total: ai.totalLayers, backend: ai.gpu } } : null,
    gpuMode: env.LOCAL_AI_GPU,
    diskFree,
  };
}

export function probeMachine(env: ServerEnv, now = Date.now()): Promise<AiMachine> {
  if (kept && kept.until > now && kept.gpuMode === env.LOCAL_AI_GPU) return kept.machine;
  const machine = read(env);
  kept = { until: now + CACHE_MS, gpuMode: env.LOCAL_AI_GPU, machine };
  machine.catch(() => {
    kept = null;
  });
  return machine;
}

/** After a switch: the next read sees the new model's memory. */
export function forgetMachine(): void {
  kept = null;
}
