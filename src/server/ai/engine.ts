import "server-only";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getEnv, type ServerEnv } from "@/config/env";
import { aiModel, DEFAULT_AI_MODEL_ID, modelInfoOf } from "./models";
import { AiAnswerIncompleteError, type EngineFailure, type AiJsonRequest, type AiJsonSchema, type AiModelInfo, type AiToolRequest, type EngineLoadResult, type LocalAiEngine } from "./types";

/**
 * Local LLM engine (node-llama-cpp, prebuilt GPU binaries, GGUF model on disk).
 *
 * - Nothing is imported or loaded until the first call.
 * - One engine per process, kept on globalThis so dev hot reloads never load the model twice.
 * - Generations run one at a time through a single queue (one context sequence, ~6.5 GB of VRAM).
 * - When the engine cannot run, callers get a failure code (translated by the caller) and a plain
 *   French reason for the log: nothing is generated in its place.
 */

type NodeLlamaCpp = typeof import("node-llama-cpp");
type ChatSessionClass = NodeLlamaCpp["LlamaChatSession"];
type ChatWrapper = InstanceType<NodeLlamaCpp["QwenChatWrapper"]>;
type Llama = Awaited<ReturnType<NodeLlamaCpp["getLlama"]>>;
type LlamaModel = Awaited<ReturnType<Llama["loadModel"]>>;
type LlamaContext = Awaited<ReturnType<LlamaModel["createContext"]>>;
type JsonGrammar = Awaited<ReturnType<Llama["createGrammarForJsonSchema"]>>;

/** The default model's name and licence; another model of the catalogue shows its own. */
export const LOCAL_AI_MODEL_INFO: AiModelInfo = { name: aiModel(DEFAULT_AI_MODEL_ID).name, license: aiModel(DEFAULT_AI_MODEL_ID).license };

const CONTEXT_SIZE = 8192;
const TEMPERATURE = 0.2;
/** Floor of the generation deadline; long answers get more (see `deadlineFor`). */
const GENERATION_TIMEOUT_MS = 120_000;
/** Fixed part of a long deadline (first-call warm-up, prompt evaluation), then a budget per answer token. */
const DEADLINE_BASE_MS = 45_000;
const DEADLINE_PER_TOKEN_MS = 35;
/** After the deadline, how long the native generation gets to stop before the engine is declared stuck. */
const STOP_GRACE_MS = 30_000;
const LOAD_FAILURE_COOLDOWN_MS = 60_000;

const DISABLED_REASON = "IA locale désactivée (LOCAL_AI_ENABLED=false).";
const TIMEOUT_MESSAGE = "L'IA locale n'a pas répondu dans le délai prévu. Génération arrêtée.";
const STUCK_REASON = "Le moteur d'IA locale ne s'est pas arrêté après un délai dépassé. Nouvel essai possible dans une minute.";

/** Deadline of one generation: at least 120 s, more for long answers (an 18-country reading asks for ~3 200 tokens). */
export function deadlineFor(maxTokens: number): number {
  return Math.max(GENERATION_TIMEOUT_MS, DEADLINE_BASE_MS + maxTokens * DEADLINE_PER_TOKEN_MS);
}

interface EngineState {
  engine?: LocalAiEngine;
  /** The native objects behind `engine`, kept to read their memory use and to free them on a switch. */
  runtime?: LoadedRuntime;
  /** Resolves once the generations queued on `engine` are done. */
  idle?: () => Promise<unknown>;
  loading?: Promise<EngineLoadResult>;
  failure?: { readonly reason: string; readonly code: EngineFailure; readonly retryAt: number };
}

const STATE_KEY = Symbol.for("ez-shop.local-ai-engine");
const globalForEngine = globalThis as unknown as { [STATE_KEY]?: EngineState };

function engineState(): EngineState {
  globalForEngine[STATE_KEY] ??= {};
  return globalForEngine[STATE_KEY];
}

/** Only the file name reaches the client; the full path stays in the server log. */
function missingModel(absolutePath: string): EngineLoadResult {
  console.error("[ai] model file not found", absolutePath);
  const file = path.basename(absolutePath);
  return {
    ok: false,
    reason: `Modèle introuvable (${file}). Place le fichier GGUF à l'endroit indiqué par LOCAL_AI_MODEL_PATH.`,
    failure: { code: "model_missing", file },
  };
}

/** Short French sentence + the error name only: no message, no stack, no path. */
function loadFailure(error: unknown): { readonly reason: string; readonly code: EngineFailure } {
  const name = error instanceof Error && error.name ? error.name : "UnknownError";
  return { reason: `Le moteur d'IA locale n'a pas pu démarrer (${name}). Nouvel essai possible dans une minute.`, code: { code: "load_failed", error: name } };
}

async function isFile(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isFile();
  } catch {
    return false;
  }
}

/** Resolves when `work` settles, or after `ms` at the latest; then `onLate` runs once. */
function withCeiling(work: Promise<unknown>, ms: number, onLate: () => void): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      onLate();
      resolve();
    }, ms);
  });
  return Promise.race([work.finally(() => clearTimeout(timer)), late]);
}

/**
 * Runs tasks one at a time; a task's `settled` keeps the queue closed until its generation really
 * stopped. It also counts the tasks not yet stopped and when the last one stopped, so an unused model
 * can be freed.
 */
export function createSerialQueue(now: () => number = Date.now) {
  let tail: Promise<unknown> = Promise.resolve();
  let pending = 0;
  let lastActivity = now();
  function enqueue<T>(start: () => Promise<{ result: Promise<T>; settled: Promise<unknown> }>): Promise<T> {
    pending += 1;
    lastActivity = now();
    const started = tail.then(start);
    tail = started
      .then(
        (s) => s.settled,
        () => undefined,
      )
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        pending -= 1;
        lastActivity = now();
      });
    return started.then((s) => s.result);
  }
  return { enqueue, idle: () => tail, pending: () => pending, lastActivity: () => lastActivity };
}

/**
 * A model left unused this long is freed: the 5 to 17 GB it holds on the card and in memory go back to
 * the PC (games, other apps). The next AI request loads it again, which takes a few seconds.
 */
export const IDLE_RELEASE_MS = 10 * 60_000;
const IDLE_CHECK_MS = 60_000;

export function shouldRelease(pending: number, lastActivity: number, now: number, idleMs: number = IDLE_RELEASE_MS): boolean {
  return idleMs > 0 && pending === 0 && now - lastActivity >= idleMs;
}

interface LoadedRuntime {
  readonly llama: Llama;
  readonly model: LlamaModel;
  readonly context: LlamaContext;
  readonly chatWrapper: ChatWrapper;
  readonly LlamaChatSession: ChatSessionClass;
  readonly defineFunction?: NodeLlamaCpp["defineChatSessionFunction"];
}

/**
 * `onStuck` runs when a generation still has not stopped `STOP_GRACE_MS` after its deadline: the
 * queue is released anyway and the engine must be dropped (the caller reloads it later).
 */
function createEngine(runtime: LoadedRuntime, info: AiModelInfo, queue: ReturnType<typeof createSerialQueue>, onStuck: () => void): LocalAiEngine {
  const { enqueue } = queue;
  const grammars = new Map<string, Promise<JsonGrammar>>();

  function grammarFor(schema: AiJsonSchema): Promise<JsonGrammar> {
    const key = JSON.stringify(schema);
    let grammar = grammars.get(key);
    if (!grammar) {
      // AiJsonSchema is the runtime subset node-llama-cpp accepts; its static type is too strict for a generic record.
      grammar = runtime.llama.createGrammarForJsonSchema(schema as never) as Promise<JsonGrammar>;
      grammars.set(key, grammar);
      grammar.catch(() => grammars.delete(key));
    }
    return grammar;
  }

  async function generate(request: AiJsonRequest, signal: AbortSignal): Promise<unknown> {
    const grammar = await grammarFor(request.schema);
    signal.throwIfAborted();
    // A fresh sequence and session per call (as in the spike): no history leaks from one analysis to the next.
    const sequence = runtime.context.getSequence();
    try {
      const session = new runtime.LlamaChatSession({
        contextSequence: sequence,
        chatWrapper: runtime.chatWrapper,
        systemPrompt: request.system,
      });
      try {
        const text = await session.prompt(request.user, {
          grammar,
          maxTokens: request.maxTokens,
          temperature: TEMPERATURE,
          budgets: { thoughtTokens: 0 },
          signal,
        });
        try {
          return grammar.parse(text);
        } catch {
          // Cut off at maxTokens: the JSON never closed. Not an engine failure.
          throw new AiAnswerIncompleteError();
        }
      } finally {
        session.dispose({ disposeSequence: false });
      }
    } finally {
      // Returns the only sequence to the context so the next queued call can take it.
      await sequence.dispose();
    }
  }

  /** A free answer with tools: node-llama-cpp runs the calls the model asks for and feeds their results back. */
  async function generateWithTools(request: AiToolRequest, signal: AbortSignal): Promise<unknown> {
    const define = runtime.defineFunction;
    if (!define) throw new Error("Tools are not available in this engine.");
    const functions = Object.fromEntries(
      request.tools.map((tool) => [tool.name, define({ description: tool.description, params: tool.params as never, handler: (params: unknown) => tool.handler(params) })]),
    );
    const sequence = runtime.context.getSequence();
    try {
      const session = new runtime.LlamaChatSession({ contextSequence: sequence, chatWrapper: runtime.chatWrapper, systemPrompt: request.system });
      try {
        return await session.prompt(request.user, { functions, maxTokens: request.maxTokens, temperature: TEMPERATURE, budgets: { thoughtTokens: 0 }, signal });
      } finally {
        session.dispose({ disposeSequence: false });
      }
    } finally {
      await sequence.dispose();
    }
  }

  async function start(request: AiJsonRequest): Promise<{ result: Promise<unknown>; settled: Promise<unknown> }> {
    return startWork(request, (signal) => generate(request, signal));
  }

  async function startWork(request: { readonly maxTokens: number; readonly signal?: AbortSignal; readonly deadlineMs?: number }, work: (signal: AbortSignal) => Promise<unknown>): Promise<{ result: Promise<unknown>; settled: Promise<unknown> }> {
    request.signal?.throwIfAborted();
    const deadline = request.deadlineMs ?? deadlineFor(request.maxTokens);
    const timeout = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(TIMEOUT_MESSAGE);
        timeout.abort(error);
        reject(error);
      }, deadline);
    });
    // Never reported on its own: it only matters through the race below.
    timedOut.catch(() => undefined);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout.signal]) : timeout.signal;
    const running = work(signal).finally(() => clearTimeout(timer));
    return {
      // The caller gets its answer at the deadline even if the native generation is slow to stop.
      result: Promise.race([running, timedOut]),
      settled: withCeiling(running.catch(() => undefined), deadline + STOP_GRACE_MS, onStuck),
    };
  }

  return {
    model: info,
    contextTokens: runtime.context.contextSize,
    completeJson: (request) => enqueue(() => start(request)),
    runWithTools: runtime.defineFunction ? (request) => enqueue(() => startWork(request, (signal) => generateWithTools(request, signal))) as Promise<string> : undefined,
  };
}

/** Reloads after a context that did not fit on the card: at most this many tries, each with a fifth fewer layers there. */
const MAX_FIT_TRIES = 5;
const FIT_STEP = 0.8;

/** The layers to keep on the card for the next try, or null to give up (not a card-memory error, or nothing left to move). */
export function fewerLayers(onCard: number | undefined, error: unknown, attempt: number): number | null {
  if (attempt >= MAX_FIT_TRIES || typeof onCard !== "number" || onCard <= 0) return null;
  if (!(error instanceof Error) || !/vram/i.test(error.message)) return null;
  return Math.floor(onCard * FIT_STEP);
}

async function loadRuntime(modelPath: string, gpu: boolean): Promise<LoadedRuntime> {
  const { getLlama, LlamaChatSession, QwenChatWrapper, defineChatSessionFunction } = await import("node-llama-cpp");
  // Prebuilt binaries only (Vulkan / CUDA / CPU): never compile llama.cpp from a web request.
  const llama = await getLlama(gpu ? { build: "never" } : { build: "never", gpu: false });
  try {
    // The card first, then memory: as many layers on the card as leave room for the context there, the
    // rest from memory. node-llama-cpp's estimate can be too generous for the Qwen 3.5 architecture on
    // a card smaller than the model; then the model is loaded again with fewer layers on the card.
    let gpuLayers: number | { fitContext: { contextSize: number } } = { fitContext: { contextSize: CONTEXT_SIZE } };
    for (let attempt = 1; ; attempt += 1) {
      const model = await llama.loadModel({ modelPath, gpuLayers });
      try {
        // The full context when the card holds it; else the largest that fits, never under half.
        const context = await model
          .createContext({ contextSize: CONTEXT_SIZE, sequences: 1 })
          .catch(() => model.createContext({ contextSize: { min: CONTEXT_SIZE / 2, max: CONTEXT_SIZE }, sequences: 1 }));
        const chatWrapper = new QwenChatWrapper({ variation: "3.5", thoughts: "discourage" });
        return { llama, model, context, chatWrapper, LlamaChatSession, defineFunction: defineChatSessionFunction };
      } catch (error) {
        const onCard = model.gpuLayers;
        await model.dispose().catch(() => undefined);
        const fewer = fewerLayers(onCard, error, attempt);
        if (fewer === null) throw error;
        gpuLayers = fewer;
      }
    }
  } catch (error) {
    // Each retry would otherwise leave one more backend instance behind.
    await llama.dispose().catch(() => undefined);
    throw error;
  }
}

async function load(state: EngineState, modelPath: string, gpu: boolean): Promise<EngineLoadResult> {
  if (!(await isFile(modelPath))) return missingModel(modelPath);
  try {
    const runtime = await loadRuntime(modelPath, gpu);
    const queue = createSerialQueue();
    const engine = createEngine(runtime, modelInfoOf(modelPath), queue, () => {
      console.error("[ai] generation did not stop after its deadline: engine dropped");
      if (state.engine === engine) {
        state.engine = undefined;
        state.runtime = undefined;
      }
      state.failure = { reason: STUCK_REASON, code: { code: "stuck" }, retryAt: Date.now() + LOAD_FAILURE_COOLDOWN_MS };
      void runtime.llama.dispose().catch(() => undefined);
    });
    state.engine = engine;
    state.runtime = runtime;
    state.idle = queue.idle;
    state.failure = undefined;
    // Frees this model once it has been idle long enough; stops watching when another model replaced it.
    const watch = setInterval(() => {
      if (state.runtime !== runtime) {
        clearInterval(watch);
        return;
      }
      if (!state.loading && shouldRelease(queue.pending(), queue.lastActivity(), Date.now())) {
        clearInterval(watch);
        console.warn("[ai] model unused for 10 minutes: freed from the card and memory");
        void releaseLocalAiEngine();
      }
    }, IDLE_CHECK_MS);
    watch.unref?.();
    return { ok: true, engine };
  } catch (error) {
    // The whole error in the server log (it may name a path); the visitor only gets its name.
    console.error("[ai] engine could not start", error);
    const { reason, code } = loadFailure(error);
    state.failure = { reason, code, retryAt: Date.now() + LOAD_FAILURE_COOLDOWN_MS };
    return { ok: false, reason, failure: code };
  }
}

/**
 * The process-wide local AI engine, loaded on first use. Concurrent first callers share one load;
 * a failed load is reported for 60 s, then retried.
 */
export function getLocalAiEngine(env: ServerEnv = getEnv()): Promise<EngineLoadResult> {
  if (!env.LOCAL_AI_ENABLED) return Promise.resolve({ ok: false, reason: DISABLED_REASON, failure: { code: "disabled" } });

  const modelPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.LOCAL_AI_MODEL_PATH);
  const state = engineState();
  // One model in memory: a loaded engine is kept until `releaseLocalAiEngine` (the settings page calls it on a switch).
  if (state.engine) return Promise.resolve({ ok: true, engine: state.engine });
  if (state.loading) return state.loading;
  if (state.failure && Date.now() < state.failure.retryAt) {
    return Promise.resolve({ ok: false, reason: state.failure.reason, failure: state.failure.code });
  }

  const loading = load(state, modelPath, env.LOCAL_AI_GPU !== "off").finally(() => {
    state.loading = undefined;
  });
  state.loading = loading;
  return loading;
}

/**
 * Frees the loaded model once its queued generations are done, so the next call loads the model and
 * the graphics setting now configured. Calls arriving meanwhile load the new model.
 */
export async function releaseLocalAiEngine(): Promise<void> {
  const state = engineState();
  await state.loading?.catch(() => undefined);
  const runtime = state.runtime;
  const idle = state.idle;
  state.engine = undefined;
  state.runtime = undefined;
  state.idle = undefined;
  state.failure = undefined;
  if (!runtime) return;
  await idle?.().catch(() => undefined);
  await runtime.llama.dispose().catch(() => undefined);
}

/** The memory the loaded model takes right now, read from its backend; null when no model is loaded. */
export async function localAiMemory(): Promise<{ readonly vram: number; readonly ram: number; readonly gpu: string | false; readonly gpuLayers: number; readonly totalLayers: number } | null> {
  const runtime = engineState().runtime;
  if (!runtime) return null;
  try {
    const usage = await runtime.llama.getLlamaMemoryUsage();
    return { vram: usage.gpuVram, ram: usage.cpuRam, gpu: runtime.llama.gpu, gpuLayers: runtime.model.gpuLayers, totalLayers: runtime.model.fileInsights.totalLayers };
  } catch {
    return null;
  }
}

/** The backend of the loaded model, to read the graphics card without starting a second one. */
export function loadedLlama(): Llama | null {
  return engineState().runtime?.llama ?? null;
}
