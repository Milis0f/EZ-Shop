import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv, type ServerEnv } from "@/config/env";
import { getLocalAiEngine, LOCAL_AI_MODEL_INFO } from "./engine";
import type { AiJsonRequest, LocalAiEngine } from "./types";

interface PromptOptions {
  readonly signal: AbortSignal;
  readonly [key: string]: unknown;
}

// node-llama-cpp is never loaded here: every native object is a fake.
const fake = vi.hoisted(() => {
  const prompt = vi.fn<(text: string, options: PromptOptions) => Promise<string>>();
  const sequenceDispose = vi.fn(async () => undefined);
  const context = { getSequence: vi.fn(() => ({ dispose: sequenceDispose })) };
  const model = { createContext: vi.fn(async () => context), dispose: vi.fn(async () => undefined) };
  const createGrammarForJsonSchema = vi.fn(async () => ({ parse: (text: string): unknown => JSON.parse(text) }));
  const llama = { loadModel: vi.fn(async () => model), createGrammarForJsonSchema };
  const getLlama = vi.fn(async (): Promise<unknown> => llama);
  const sessionOptions: unknown[] = [];
  const wrapperOptions: unknown[] = [];
  class LlamaChatSession {
    constructor(options: unknown) {
      sessionOptions.push(options);
    }
    prompt(text: string, options: PromptOptions): Promise<string> {
      return prompt(text, options);
    }
    dispose(): void {}
  }
  class QwenChatWrapper {
    constructor(options: unknown) {
      wrapperOptions.push(options);
    }
  }
  return { prompt, sequenceDispose, context, model, llama, getLlama, createGrammarForJsonSchema, sessionOptions, wrapperOptions, LlamaChatSession, QwenChatWrapper };
});

vi.mock("node-llama-cpp", () => ({
  getLlama: fake.getLlama,
  LlamaChatSession: fake.LlamaChatSession,
  QwenChatWrapper: fake.QwenChatWrapper,
}));

const STATE_KEY = Symbol.for("ez-shop.local-ai-engine");
const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } } } as const;

let tempDir: string;
let modelFile: string;

const envWith = (overrides: Partial<ServerEnv>): ServerEnv => ({ ...getEnv(), LOCAL_AI_ENABLED: true, LOCAL_AI_MODEL_PATH: modelFile, ...overrides });
const request = (overrides: Partial<AiJsonRequest> = {}): AiJsonRequest => ({ system: "sys", user: "user", schema: SCHEMA, maxTokens: 64, ...overrides });
/** Lets pending promise chains (queue, grammar, prompt) run without touching fake timers. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function loadedEngine(): Promise<LocalAiEngine> {
  const result = await getLocalAiEngine(envWith({}));
  if (!result.ok) throw new Error(result.reason);
  return result.engine;
}

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "ez-shop-engine-"));
  modelFile = path.join(tempDir, "fake-model.gguf");
  await writeFile(modelFile, "not a real model");
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[STATE_KEY];
  vi.clearAllMocks();
  fake.sessionOptions.length = 0;
  fake.wrapperOptions.length = 0;
  fake.getLlama.mockImplementation(async () => fake.llama);
  fake.prompt.mockImplementation(async () => '{"ok":true}');
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getLocalAiEngine", () => {
  it("reports a disabled engine without importing node-llama-cpp", async () => {
    const result = await getLocalAiEngine(envWith({ LOCAL_AI_ENABLED: false }));
    expect(result).toEqual({ ok: false, reason: "IA locale désactivée (LOCAL_AI_ENABLED=false)." });
    expect(fake.getLlama).not.toHaveBeenCalled();
  });

  it("reports a missing model file with its path relative to the project", async () => {
    const result = await getLocalAiEngine(envWith({ LOCAL_AI_MODEL_PATH: ".data/models/absent.gguf" }));
    expect(result).toEqual({
      ok: false,
      reason: "Modèle introuvable : .data/models/absent.gguf. Place le fichier GGUF à cet endroit ou règle LOCAL_AI_MODEL_PATH.",
    });
    expect(fake.getLlama).not.toHaveBeenCalled();
  });

  it("loads with prebuilt binaries, the Qwen 3.5 wrapper and one sequence", async () => {
    const engine = await loadedEngine();
    expect(engine.model).toEqual(LOCAL_AI_MODEL_INFO);
    expect(fake.getLlama).toHaveBeenCalledWith({ build: "never" });
    expect(fake.llama.loadModel).toHaveBeenCalledWith({ modelPath: modelFile });
    expect(fake.model.createContext).toHaveBeenCalledWith(expect.objectContaining({ sequences: 1 }));
    expect(fake.wrapperOptions).toEqual([{ variation: "3.5", thoughts: "discourage" }]);
  });

  it("shares one load between concurrent first callers and keeps the engine afterwards", async () => {
    const env = envWith({});
    const [a, b] = await Promise.all([getLocalAiEngine(env), getLocalAiEngine(env)]);
    const c = await getLocalAiEngine(env);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(b.engine).toBe(a.engine);
      expect(c.engine).toBe(a.engine);
    }
    expect(fake.getLlama).toHaveBeenCalledTimes(1);
    expect(fake.llama.loadModel).toHaveBeenCalledTimes(1);
  });

  it("sanitises a load failure, caches it for 60 s, then retries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const failure = Object.assign(new Error("VRAM full while loading C:\\Users\\someone\\secret\\model.gguf\n    at native"), {
      name: "InsufficientMemoryError",
    });
    fake.getLlama.mockRejectedValueOnce(failure);
    const env = envWith({});

    const first = await getLocalAiEngine(env);
    expect(first).toEqual({
      ok: false,
      reason: "Le moteur d'IA locale n'a pas pu démarrer (InsufficientMemoryError). Nouvel essai possible dans une minute.",
    });
    expect(first.ok ? "" : first.reason).not.toMatch(/secret|VRAM|at native/);

    vi.advanceTimersByTime(59_000);
    expect(await getLocalAiEngine(env)).toEqual(first);
    expect(fake.getLlama).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1_001);
    const retried = await getLocalAiEngine(env);
    expect(retried.ok).toBe(true);
    expect(fake.getLlama).toHaveBeenCalledTimes(2);
  });

  it("frees the model when the context cannot be created", async () => {
    fake.model.createContext.mockRejectedValueOnce(new Error("no memory"));
    const result = await getLocalAiEngine(envWith({}));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("(Error)") });
    expect(fake.model.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("LocalAiEngine.completeJson", () => {
  it("runs one grammar-constrained generation with low temperature and no thinking budget", async () => {
    const engine = await loadedEngine();
    await expect(engine.completeJson(request({ user: "Bonjour", maxTokens: 321 }))).resolves.toEqual({ ok: true });
    expect(fake.createGrammarForJsonSchema).toHaveBeenCalledWith(SCHEMA);
    expect(fake.sessionOptions[0]).toMatchObject({ systemPrompt: "sys" });
    const [text, options] = fake.prompt.mock.calls[0]!;
    expect(text).toBe("Bonjour");
    expect(options).toMatchObject({ maxTokens: 321, temperature: 0.2, budgets: { thoughtTokens: 0 } });
    expect(options.grammar).toBeDefined();
    expect(fake.sequenceDispose).toHaveBeenCalledTimes(1);
  });

  it("serialises generations and reuses the grammar of an identical schema", async () => {
    const engine = await loadedEngine();
    const releases: Array<(text: string) => void> = [];
    fake.prompt.mockImplementation(() => new Promise<string>((resolve) => releases.push(resolve)));

    const first = engine.completeJson(request({ user: "one" }));
    const second = engine.completeJson(request({ user: "two" }));
    await flush();
    expect(fake.prompt).toHaveBeenCalledTimes(1);
    expect(fake.prompt.mock.calls[0]![0]).toBe("one");

    releases[0]!('{"ok":true}');
    await expect(first).resolves.toEqual({ ok: true });
    await flush();
    expect(fake.prompt).toHaveBeenCalledTimes(2);
    expect(fake.prompt.mock.calls[1]![0]).toBe("two");

    releases[1]!('{"ok":false}');
    await expect(second).resolves.toEqual({ ok: false });
    expect(fake.createGrammarForJsonSchema).toHaveBeenCalledTimes(1);
  });

  it("keeps the queue going after a failed generation", async () => {
    const engine = await loadedEngine();
    fake.prompt.mockRejectedValueOnce(new Error("boom"));
    await expect(engine.completeJson(request())).rejects.toThrow("boom");
    await expect(engine.completeJson(request())).resolves.toEqual({ ok: true });
    expect(fake.sequenceDispose).toHaveBeenCalledTimes(2);
  });

  it("aborts a generation after 120 s with a French message", async () => {
    const engine = await loadedEngine();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let seenSignal: AbortSignal | undefined;
    fake.prompt.mockImplementation(
      (_text, options) =>
        new Promise<string>((_, reject) => {
          seenSignal = options.signal;
          options.signal.addEventListener("abort", () => reject(options.signal.reason));
        }),
    );

    const pending = engine.completeJson(request());
    const outcome = pending.catch((error: unknown) => error);
    await flush();
    vi.advanceTimersByTime(119_999);
    await flush();
    expect(seenSignal?.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("L'IA locale n'a pas répondu en moins de 120 secondes. Génération arrêtée.");
    expect(seenSignal?.aborted).toBe(true);
  });

  it("answers at the deadline even if the generation is slow to stop, and holds the queue until it does", async () => {
    const engine = await loadedEngine();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let finishStuck: ((text: string) => void) | undefined;
    fake.prompt.mockImplementationOnce(() => new Promise<string>((resolve) => (finishStuck = resolve)));

    const stuck = engine.completeJson(request({ user: "stuck" })).catch((error: unknown) => error);
    const next = engine.completeJson(request({ user: "next" }));
    await flush();
    vi.advanceTimersByTime(120_000);
    expect(await stuck).toBeInstanceOf(Error);
    await flush();
    expect(fake.prompt).toHaveBeenCalledTimes(1);

    finishStuck!('{"ok":true}');
    await expect(next).resolves.toEqual({ ok: true });
    expect(fake.prompt).toHaveBeenCalledTimes(2);
  });

  it("forwards the caller's abort signal and skips a request aborted while queued", async () => {
    const engine = await loadedEngine();
    const controller = new AbortController();
    controller.abort(new Error("client gone"));
    await expect(engine.completeJson(request({ signal: controller.signal }))).rejects.toThrow("client gone");
    expect(fake.prompt).not.toHaveBeenCalled();

    const live = new AbortController();
    await engine.completeJson(request({ signal: live.signal }));
    const options = fake.prompt.mock.calls[0]![1];
    live.abort(new Error("stop"));
    expect(options.signal.aborted).toBe(true);
  });
});
