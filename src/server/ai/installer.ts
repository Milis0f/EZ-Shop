import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getEnv, type ServerEnv } from "@/config/env";
import type { AiInstallStatus } from "@/domain/web";

/**
 * Installs the local model from the app: a free download from Hugging Face, with resume, a disk-space
 * check and a SHA-256 check before the file is put in place. One download per process.
 */

export const MODEL_URL = "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf";
export const MODEL_SHA256 = "03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8";
/** Announced before the server states the real size. */
export const MODEL_BYTES_ESTIMATE = 5_700_000_000;
const SPARE_DISK_BYTES = 1_000_000_000;

type Phase = "idle" | "downloading" | "verifying" | "failed";
type InstallError = NonNullable<AiInstallStatus["error"]>;

interface InstallState {
  phase: Phase;
  downloadedBytes: number;
  totalBytes: number;
  error: InstallError | null;
  abort?: AbortController;
  running?: Promise<void>;
}

export interface InstallDeps {
  readonly fetch: typeof fetch;
  readonly freeBytes: (dir: string) => Promise<number>;
  readonly url: string;
  readonly sha256: string;
}

const DEFAULT_DEPS: InstallDeps = {
  fetch: (input, init) => fetch(input, init),
  freeBytes: async (dir) => {
    const stats = await statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  },
  url: MODEL_URL,
  sha256: MODEL_SHA256,
};

const STATE_KEY = Symbol.for("ez-shop.local-ai-installer");
const globalForInstall = globalThis as unknown as { [STATE_KEY]?: InstallState };

const initialState = (): InstallState => ({ phase: "idle", downloadedBytes: 0, totalBytes: MODEL_BYTES_ESTIMATE, error: null });

function state(): InstallState {
  globalForInstall[STATE_KEY] ??= initialState();
  return globalForInstall[STATE_KEY];
}

/** Tests only. */
export function resetInstaller(): void {
  globalForInstall[STATE_KEY] = initialState();
}

const modelPathOf = (env: ServerEnv): string => path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.LOCAL_AI_MODEL_PATH);

async function fileSize(file: string): Promise<number | null> {
  try {
    const info = await stat(file);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

export async function installStatus(env: ServerEnv = getEnv()): Promise<AiInstallStatus> {
  const s = state();
  const base = { downloadedBytes: s.downloadedBytes, totalBytes: s.totalBytes, error: s.error };
  if (!env.LOCAL_AI_ENABLED) return { ...base, state: "disabled" };
  if (s.phase === "downloading" || s.phase === "verifying") return { ...base, state: s.phase };
  if ((await fileSize(modelPathOf(env))) !== null) return { ...base, state: "installed", error: null };
  return { ...base, state: s.phase === "failed" ? "failed" : "missing" };
}

export async function sha256OfFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

class InstallFailure extends Error {
  constructor(readonly code: InstallError) {
    super(code);
  }
}

async function download(target: string, s: InstallState, deps: InstallDeps, signal: AbortSignal): Promise<void> {
  const part = `${target}.part`;
  await mkdir(path.dirname(target), { recursive: true });
  const existing = (await fileSize(part)) ?? 0;

  let response: Response;
  try {
    response = await deps.fetch(deps.url, {
      headers: existing > 0 ? { Range: `bytes=${existing}-` } : {},
      signal,
      redirect: "follow",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new InstallFailure("network");
  }
  if (response.status === 416) {
    // The part is already complete (or stale): the checksum decides.
    s.downloadedBytes = existing;
    s.totalBytes = existing;
    return;
  }
  if (!response.ok || !response.body) throw new InstallFailure("network");

  // A server that ignores Range answers 200 with the whole file: start over.
  const resuming = response.status === 206;
  const offset = resuming ? existing : 0;
  const announced = Number(response.headers.get("content-length") ?? 0);
  const total = announced > 0 ? announced + offset : MODEL_BYTES_ESTIMATE;
  s.downloadedBytes = offset;
  s.totalBytes = total;

  if ((await deps.freeBytes(path.dirname(target))) < total - offset + SPARE_DISK_BYTES) {
    await response.body.cancel().catch(() => undefined);
    throw new InstallFailure("disk_full");
  }

  const counted = Readable.fromWeb(response.body as never);
  counted.on("data", (chunk: Buffer) => {
    s.downloadedBytes += chunk.length;
  });
  try {
    await pipeline(counted, createWriteStream(part, { flags: resuming ? "a" : "w" }), { signal });
  } catch (error) {
    if (signal.aborted) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOSPC") throw new InstallFailure("disk_full");
    throw new InstallFailure(code === "EACCES" || code === "EPERM" || code === "EROFS" ? "write" : "network");
  }
}

async function run(target: string, s: InstallState, deps: InstallDeps, signal: AbortSignal): Promise<void> {
  const part = `${target}.part`;
  try {
    await download(target, s, deps, signal);
    s.phase = "verifying";
    if ((await sha256OfFile(part)) !== deps.sha256) {
      await unlink(part).catch(() => undefined);
      throw new InstallFailure("checksum");
    }
    await rename(part, target);
    s.phase = "idle";
    s.error = null;
  } catch (error) {
    if (signal.aborted) {
      // Cancelled: the part stays, the next start resumes it.
      s.phase = "idle";
      s.error = null;
      return;
    }
    s.phase = "failed";
    s.error = error instanceof InstallFailure ? error.code : "write";
    console.error("[ai] model install failed", s.error);
  }
}

/** Starts the download unless one is running or the model is there. Returns at once. */
export async function startInstall(env: ServerEnv = getEnv(), overrides: Partial<InstallDeps> = {}): Promise<AiInstallStatus> {
  const s = state();
  const current = await installStatus(env);
  if (current.state !== "missing" && current.state !== "failed") return current;
  const abort = new AbortController();
  s.phase = "downloading";
  s.error = null;
  s.abort = abort;
  s.running = run(modelPathOf(env), s, { ...DEFAULT_DEPS, ...overrides }, abort.signal).finally(() => {
    s.abort = undefined;
    s.running = undefined;
  });
  return installStatus(env);
}

export async function cancelInstall(env: ServerEnv = getEnv()): Promise<AiInstallStatus> {
  const s = state();
  s.abort?.abort();
  await s.running;
  return installStatus(env);
}

/** Tests: waits for the download in progress. */
export const installSettled = (): Promise<void> => state().running ?? Promise.resolve();
