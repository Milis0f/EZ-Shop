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
}

export interface LocalAiEngine {
  readonly model: AiModelInfo;
  /** Runs one grammar-constrained generation and returns the parsed JSON (still to be validated by the caller). */
  completeJson(request: AiJsonRequest): Promise<unknown>;
}

export type EngineLoadResult =
  | { readonly ok: true; readonly engine: LocalAiEngine }
  | { readonly ok: false; readonly reason: string };

/** The model stopped before closing its JSON (token limit reached): the answer is incomplete, not an engine failure. */
export class AiAnswerIncompleteError extends Error {
  override readonly name = "AiAnswerIncompleteError";
  constructor() {
    super("The model answer is not complete JSON.");
  }
}
