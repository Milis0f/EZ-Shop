import "server-only";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getEnv, type ServerEnv } from "@/config/env";
import { AiAnswerIncompleteError, type EngineFailure, type AiJsonRequest, type AiJsonSchema, type AiModelInfo, type EngineLoadResult, type LocalAiEngine } from "./types";

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

export const LOCAL_AI_MODEL_INFO: AiModelInfo = { name: "Qwen3.5-9B (Q4_K_M)", license: "Apache-2.0" };

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

/** Runs tasks one at a time; a task's `settled` keeps the queue closed until its generation really stopped. */
function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(start: () => Promise<{ result: Promise<T>; settled: Promise<unknown> }>): Promise<T> {
    const started = tail.then(start);
    tail = started.then(
      (s) => s.settled,
      () => undefined,
    );
    return started.then((s) => s.result);
  };
}

interface LoadedRuntime {
  readonly llama: Llama;
  readonly context: LlamaContext;
  readonly chatWrapper: ChatWrapper;
  readonly LlamaChatSession: ChatSessionClass;
}

/**
 * `onStuck` runs when a generation still has not stopped `STOP_GRACE_MS` after its deadline: the
 * queue is released anyway and the engine must be dropped (the caller reloads it later).
 */
function createEngine(runtime: LoadedRuntime, onStuck: () => void): LocalAiEngine {
  const enqueue = createSerialQueue();
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

  async function start(request: AiJsonRequest): Promise<{ result: Promise<unknown>; settled: Promise<unknown> }> {
    request.signal?.throwIfAborted();
    const deadline = deadlineFor(request.maxTokens);
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
    const work = generate(request, signal).finally(() => clearTimeout(timer));
    return {
      // The caller gets its answer at the deadline even if the native generation is slow to stop.
      result: Promise.race([work, timedOut]),
      settled: withCeiling(work.catch(() => undefined), deadline + STOP_GRACE_MS, onStuck),
    };
  }

  return {
    model: LOCAL_AI_MODEL_INFO,
    completeJson: (request) => enqueue(() => start(request)),
  };
}

async function loadRuntime(modelPath: string): Promise<LoadedRuntime> {
  const { getLlama, LlamaChatSession, QwenChatWrapper } = await import("node-llama-cpp");
  // Prebuilt binaries only (Vulkan / CUDA / CPU): never compile llama.cpp from a web request.
  const llama = await getLlama({ build: "never" });
  try {
    const model = await llama.loadModel({ modelPath });
    try {
      const context = await model.createContext({ contextSize: CONTEXT_SIZE, sequences: 1 });
      const chatWrapper = new QwenChatWrapper({ variation: "3.5", thoughts: "discourage" });
      return { llama, context, chatWrapper, LlamaChatSession };
    } catch (error) {
      await model.dispose().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    // Each retry would otherwise leave one more backend instance behind.
    await llama.dispose().catch(() => undefined);
    throw error;
  }
}

async function load(state: EngineState, modelPath: string): Promise<EngineLoadResult> {
  if (!(await isFile(modelPath))) return missingModel(modelPath);
  try {
    const runtime = await loadRuntime(modelPath);
    const engine = createEngine(runtime, () => {
      console.error("[ai] generation did not stop after its deadline: engine dropped");
      if (state.engine === engine) state.engine = undefined;
      state.failure = { reason: STUCK_REASON, code: { code: "stuck" }, retryAt: Date.now() + LOAD_FAILURE_COOLDOWN_MS };
      void runtime.llama.dispose().catch(() => undefined);
    });
    state.engine = engine;
    state.failure = undefined;
    return { ok: true, engine };
  } catch (error) {
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
  // One model in VRAM: a loaded engine is kept even if LOCAL_AI_MODEL_PATH changes (restart to switch models).
  if (state.engine) return Promise.resolve({ ok: true, engine: state.engine });
  if (state.loading) return state.loading;
  if (state.failure && Date.now() < state.failure.retryAt) {
    return Promise.resolve({ ok: false, reason: state.failure.reason, failure: state.failure.code });
  }

  const loading = load(state, modelPath).finally(() => {
    state.loading = undefined;
  });
  state.loading = loading;
  return loading;
}
