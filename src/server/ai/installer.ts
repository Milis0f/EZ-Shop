import "server-only";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getEnv, type ServerEnv } from "@/config/env";
import type { AiInstallStatus } from "@/domain/web";
import { AI_MODELS, aiModel, DEFAULT_AI_MODEL_ID, modelOfPath, modelPathFor, type AiModelId, type AiModelSpec } from "./models";

/**
 * Installs a local model of the catalogue from the app: a free download from Hugging Face, with resume,
 * a disk-space check and a SHA-256 check before the file is put in place. One download per process.
 */

const DEFAULT_SPEC = aiModel(DEFAULT_AI_MODEL_ID);
export const MODEL_URL = DEFAULT_SPEC.url;
export const MODEL_SHA256 = DEFAULT_SPEC.sha256;
/** Announced before the server states the real size. */
export const MODEL_BYTES_ESTIMATE = DEFAULT_SPEC.bytes;
const SPARE_DISK_BYTES = 1_000_000_000;

type Phase = "idle" | "downloading" | "verifying" | "failed";
type InstallError = NonNullable<AiInstallStatus["error"]>;

interface InstallState {
  /** The model being downloaded, or last downloaded; null for the configured file of the owner's own. */
  model: AiModelId | null;
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

const initialState = (): InstallState => ({ model: null, phase: "idle", downloadedBytes: 0, totalBytes: MODEL_BYTES_ESTIMATE, error: null });

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

/** The model the configured path points to, and where a download of a catalogue model goes. */
function targetOf(env: ServerEnv, id?: AiModelId): { readonly spec: AiModelSpec; readonly id: AiModelId | null; readonly file: string } {
  if (id) return { spec: aiModel(id), id, file: path.resolve(/*turbopackIgnore: true*/ process.cwd(), modelPathFor(aiModel(id))) };
  const configured = modelOfPath(env.LOCAL_AI_MODEL_PATH);
  // A path outside the catalogue still gets the default model, as before there was a choice.
  return { spec: configured ?? DEFAULT_SPEC, id: configured?.id ?? null, file: modelPathOf(env) };
}

export async function installStatus(env: ServerEnv = getEnv()): Promise<AiInstallStatus> {
  const s = state();
  const active = modelOfPath(env.LOCAL_AI_MODEL_PATH)?.id ?? null;
  const busy = s.phase === "downloading" || s.phase === "verifying";
  // A download for another model than the configured one leaves the configured model's state alone.
  const forActive = s.model === null || s.model === active;
  const download = busy || s.phase === "failed" ? { model: s.model, phase: s.phase as "downloading" | "verifying" | "failed", downloadedBytes: s.downloadedBytes, totalBytes: s.totalBytes, error: s.error } : null;
  // At rest, the size announced is the configured model's own.
  const size = (modelOfPath(env.LOCAL_AI_MODEL_PATH) ?? DEFAULT_SPEC).bytes;
  const base = { downloadedBytes: forActive ? s.downloadedBytes : 0, totalBytes: forActive && busy ? s.totalBytes : size, error: forActive ? s.error : null, model: active, download };
  if (!env.LOCAL_AI_ENABLED) return { ...base, state: "disabled" };
  if (busy && forActive) return { ...base, state: s.phase as "downloading" | "verifying" };
  if ((await fileSize(modelPathOf(env))) !== null) return { ...base, state: "installed", error: null };
  return { ...base, state: s.phase === "failed" && forActive ? "failed" : "missing" };
}

/** The models of the catalogue already on this computer, in EZ-Shop's models folder or at the configured path. */
export async function installedModels(env: ServerEnv = getEnv()): Promise<AiModelId[]> {
  const configured = modelOfPath(env.LOCAL_AI_MODEL_PATH);
  const found = await Promise.all(
    AI_MODELS.map(async (spec) => {
      const own = (await fileSize(path.resolve(/*turbopackIgnore: true*/ process.cwd(), modelPathFor(spec)))) !== null;
      const atPath = configured?.id === spec.id && (await fileSize(modelPathOf(env))) !== null;
      return own || atPath ? [spec.id] : [];
    }),
  );
  return found.flat();
}

/** Whether a model of the catalogue is on this computer, at the path EZ-Shop would configure for it. */
export async function hasModelFile(id: AiModelId): Promise<boolean> {
  return (await fileSize(path.resolve(/*turbopackIgnore: true*/ process.cwd(), modelPathFor(aiModel(id))))) !== null;
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

async function download(target: string, s: InstallState, deps: InstallDeps, signal: AbortSignal, estimate: number): Promise<void> {
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
  const total = announced > 0 ? announced + offset : estimate;
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

async function run(target: string, s: InstallState, deps: InstallDeps, signal: AbortSignal, estimate: number): Promise<void> {
  const part = `${target}.part`;
  try {
    await download(target, s, deps, signal, estimate);
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

/**
 * Starts the download of a model of the catalogue (the configured one by default) unless a download is
 * running or the file is there. Returns at once.
 */
export async function startInstall(env: ServerEnv = getEnv(), overrides: Partial<InstallDeps> = {}, id?: AiModelId): Promise<AiInstallStatus> {
  const s = state();
  if (s.phase === "downloading" || s.phase === "verifying") return installStatus(env);
  const target = targetOf(env, id);
  if (!env.LOCAL_AI_ENABLED && !id) return installStatus(env);
  if ((await fileSize(target.file)) !== null) return installStatus(env);
  const abort = new AbortController();
  s.model = target.id;
  s.phase = "downloading";
  s.error = null;
  s.downloadedBytes = 0;
  s.totalBytes = target.spec.bytes;
  s.abort = abort;
  s.running = run(target.file, s, { ...DEFAULT_DEPS, url: target.spec.url, sha256: target.spec.sha256, ...overrides }, abort.signal, target.spec.bytes).finally(() => {
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
