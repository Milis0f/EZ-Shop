/**
 * Contract between the local AI engine (node-llama-cpp, see engine.ts) and
 * the features that use it. Features depend on this interface only, so tests
 * run with a fake engine and never load a model.
 */

/** JSON schema subset accepted by node-llama-cpp's grammar: no anyOf, no pattern; use enum for closed sets. */
export type AiJsonSchema = Readonly<Record<string, unknown>>;

export interface AiModelInfo {
  readonly name: string;
  readonly license: string;
}

export interface AiJsonRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: AiJsonSchema;
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
  /** The generation's own deadline, when the caller knows better than the token count (a slow model, a long task). */
  readonly deadlineMs?: number;
}

/** A function the model may call while it answers; its result goes back to the model as text. */
export interface AiTool {
  readonly name: string;
  readonly description: string;
  /** JSON schema of the call's parameters (same subset as AiJsonSchema). */
  readonly params: AiJsonSchema;
  readonly handler: (params: unknown) => Promise<string>;
}

export interface AiToolRequest {
  readonly system: string;
  readonly user: string;
  readonly tools: readonly AiTool[];
  readonly maxTokens: number;
  readonly signal?: AbortSignal;
  /** The whole run's deadline, tool calls included. */
  readonly deadlineMs?: number;
}

export interface LocalAiEngine {
  readonly model: AiModelInfo;
  /** Runs one grammar-constrained generation and returns the parsed JSON (still to be validated by the caller). */
  completeJson(request: AiJsonRequest): Promise<unknown>;
  /** Lets the model call the given tools while it writes a free text answer, which is returned. */
  runWithTools?(request: AiToolRequest): Promise<string>;
}

/**
 * Why the engine cannot run, as a code the caller translates into the visitor's language. The detail
 * is safe to show: a file name, never a path; an error name, never a message.
 */
export type EngineFailure =
  | { readonly code: "disabled" }
  | { readonly code: "model_missing"; readonly file: string }
  | { readonly code: "load_failed"; readonly error: string }
  | { readonly code: "stuck" };

export type EngineLoadResult =
  | { readonly ok: true; readonly engine: LocalAiEngine }
  /** `reason`: French sentence kept for the server log and as a fallback when `failure` is absent. */
  | { readonly ok: false; readonly reason: string; readonly failure?: EngineFailure };

/** The model stopped before closing its JSON (token limit reached): the answer is incomplete, not an engine failure. */
export class AiAnswerIncompleteError extends Error {
  override readonly name = "AiAnswerIncompleteError";
  constructor() {
    super("The model answer is not complete JSON.");
  }
}
