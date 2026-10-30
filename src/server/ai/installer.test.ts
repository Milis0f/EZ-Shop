import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { cancelInstall, installSettled, installStatus, resetInstaller, sha256OfFile, startInstall, type InstallDeps } from "./installer";

const CONTENT = Buffer.from("fake gguf model content");
const SHA = createHash("sha256").update(CONTENT).digest("hex");

let dir: string;
let modelPath: string;
let env: ServerEnv;

const deps = (overrides: Partial<InstallDeps> = {}): Partial<InstallDeps> => ({
  url: "https://models.example/m.gguf",
  sha256: SHA,
  freeBytes: async () => 1e12,
  fetch: vi.fn(async () => new Response(CONTENT, { headers: { "content-length": String(CONTENT.length) } })) as unknown as typeof fetch,
  ...overrides,
});

beforeEach(() => {
  resetInstaller();
  dir = mkdtempSync(path.join(tmpdir(), "ez-install-"));
  modelPath = path.join(dir, "models", "m.gguf");
  env = { LOCAL_AI_ENABLED: true, LOCAL_AI_MODEL_PATH: modelPath } as ServerEnv;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("installStatus", () => {
  it("is missing without the file, installed with it, disabled when off", async () => {
    expect((await installStatus(env)).state).toBe("missing");
    expect((await installStatus({ ...env, LOCAL_AI_ENABLED: false })).state).toBe("disabled");
    writeFileSync(path.join(dir, "m.gguf"), "x");
    expect((await installStatus({ ...env, LOCAL_AI_MODEL_PATH: path.join(dir, "m.gguf") })).state).toBe("installed");
  });
});

describe("startInstall", () => {
  it("downloads, checks the hash and puts the file in place", async () => {
    await startInstall(env, deps());
    await installSettled();
    expect(readFileSync(modelPath)).toEqual(CONTENT);
    expect(existsSync(`${modelPath}.part`)).toBe(false);
    expect(await installStatus(env)).toMatchObject({ state: "installed", error: null, downloadedBytes: CONTENT.length });
  });

  it("refuses a damaged file: nothing is installed and the part is gone", async () => {
    await startInstall(env, deps({ sha256: "0".repeat(64) }));
    await installSettled();
    expect(existsSync(modelPath)).toBe(false);
    expect(existsSync(`${modelPath}.part`)).toBe(false);
    expect(await installStatus(env)).toMatchObject({ state: "failed", error: "checksum" });
  });

  it("stops before writing when the disk is too small", async () => {
    await startInstall(env, deps({ freeBytes: async () => 10 }));
    await installSettled();
    expect(existsSync(`${modelPath}.part`)).toBe(false);
    expect(await installStatus(env)).toMatchObject({ state: "failed", error: "disk_full" });
  });

  it("reports a network failure and an HTTP error", async () => {
    await startInstall(env, deps({ fetch: vi.fn(async () => Promise.reject(new Error("down"))) as unknown as typeof fetch }));
    await installSettled();
    expect(await installStatus(env)).toMatchObject({ state: "failed", error: "network" });
    await startInstall(env, deps({ fetch: vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch }));
    await installSettled();
    expect(await installStatus(env)).toMatchObject({ state: "failed", error: "network" });
  });

  it("can be tried again after a failure", async () => {
    await startInstall(env, deps({ fetch: vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch }));
    await installSettled();
    await startInstall(env, deps());
    await installSettled();
    expect((await installStatus(env)).state).toBe("installed");
  });

  it("resumes a partial download with a Range request", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(modelPath), { recursive: true });
    writeFileSync(`${modelPath}.part`, CONTENT.subarray(0, 5));
    const fetchImpl = vi.fn(async () => new Response(CONTENT.subarray(5), { status: 206, headers: { "content-length": String(CONTENT.length - 5) } }));
    await startInstall(env, deps({ fetch: fetchImpl as unknown as typeof fetch }));
    await installSettled();
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toEqual({ Range: "bytes=5-" });
    expect(readFileSync(modelPath)).toEqual(CONTENT);
  });

  it("starts over when the server ignores the Range request", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(modelPath), { recursive: true });
    writeFileSync(`${modelPath}.part`, "garbage");
    await startInstall(env, deps());
    await installSettled();
    expect(readFileSync(modelPath)).toEqual(CONTENT);
  });

  it("lets the checksum decide when the part is already complete (416)", async () => {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(modelPath), { recursive: true });
    writeFileSync(`${modelPath}.part`, CONTENT);
    await startInstall(env, deps({ fetch: vi.fn(async () => new Response("", { status: 416 })) as unknown as typeof fetch }));
    await installSettled();
    expect((await installStatus(env)).state).toBe("installed");
  });

  it("does nothing when the model is there, or while a download runs", async () => {
    let release: (r: Response) => void = () => undefined;
    const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    await startInstall(env, deps({ fetch: fetchImpl as unknown as typeof fetch }));
    await startInstall(env, deps({ fetch: fetchImpl as unknown as typeof fetch }));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((await installStatus(env)).state).toBe("downloading");
    release(new Response(CONTENT));
    await installSettled();
    const again = vi.fn();
    await startInstall(env, deps({ fetch: again as unknown as typeof fetch }));
    expect(again).not.toHaveBeenCalled();
  });

  it("can be stopped, which is not a failure", async () => {
    const fetchImpl = vi.fn(
      (_: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(new DOMException("Aborted", "AbortError"));
          if (init.signal?.aborted) abort();
          init.signal?.addEventListener("abort", abort);
        }),
    );
    await startInstall(env, deps({ fetch: fetchImpl as unknown as typeof fetch }));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(await cancelInstall(env)).toMatchObject({ state: "missing", error: null });
  });
});

describe("sha256OfFile", () => {
  it("hashes a file", async () => {
    const file = path.join(dir, "f");
    writeFileSync(file, CONTENT);
    expect(await sha256OfFile(file)).toBe(SHA);
  });
});
