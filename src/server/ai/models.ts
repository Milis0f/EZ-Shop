import path from "node:path";
import type { AiModelInfo } from "./types";

/**
 * The local models EZ-Shop offers, from the smallest to the largest. All are Qwen 3.5 (Apache-2.0) in
 * the Q4_K_M quantisation from unsloth, so the same chat wrapper and prompts serve each of them. Sizes
 * and SHA-256 come from Hugging Face's file listing; a download is put in place only if its hash matches.
 */

export const AI_MODEL_IDS = ["qwen3.5-2b", "qwen3.5-4b", "qwen3.5-9b", "qwen3.5-35b-a3b"] as const;
export type AiModelId = (typeof AI_MODEL_IDS)[number];

export const AI_MODEL_TIERS = ["tiny", "light", "balanced", "strong"] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

export interface AiModelSpec {
  readonly id: AiModelId;
  readonly name: string;
  readonly tier: AiModelTier;
  readonly file: string;
  readonly url: string;
  readonly sha256: string;
  /** Exact size of the file. */
  readonly bytes: number;
  /**
   * Memory the model takes once loaded with EZ-Shop's 8 192-token context, rounded up: the file, the
   * context and the backend's working space. An estimate; the settings page says so.
   */
  readonly needBytes: number;
  readonly license: string;
}

const GB = 1_000_000_000;
const HF = "https://huggingface.co/unsloth";

export const AI_MODELS: readonly AiModelSpec[] = [
  {
    id: "qwen3.5-2b",
    name: "Qwen3.5-2B (Q4_K_M)",
    tier: "tiny",
    file: "Qwen3.5-2B-Q4_K_M.gguf",
    url: `${HF}/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf`,
    sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
    bytes: 1_280_835_840,
    needBytes: 2.3 * GB,
    license: "Apache-2.0",
  },
  {
    id: "qwen3.5-4b",
    name: "Qwen3.5-4B (Q4_K_M)",
    tier: "light",
    file: "Qwen3.5-4B-Q4_K_M.gguf",
    url: `${HF}/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf`,
    sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
    bytes: 2_740_937_888,
    needBytes: 4 * GB,
    license: "Apache-2.0",
  },
  {
    id: "qwen3.5-9b",
    name: "Qwen3.5-9B (Q4_K_M)",
    tier: "balanced",
    file: "Qwen3.5-9B-Q4_K_M.gguf",
    url: `${HF}/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf`,
    sha256: "03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8",
    bytes: 5_680_522_464,
    needBytes: 7 * GB,
    license: "Apache-2.0",
  },
  {
    id: "qwen3.5-35b-a3b",
    name: "Qwen3.5-35B-A3B (Q4_K_M)",
    tier: "strong",
    file: "Qwen3.5-35B-A3B-Q4_K_M.gguf",
    url: `${HF}/Qwen3.5-35B-A3B-GGUF/resolve/main/Qwen3.5-35B-A3B-Q4_K_M.gguf`,
    sha256: "3b46d1066bc91cc2d613e3bc22ce691dd77e6f0d33c9060690d24ce6de494375",
    bytes: 22_016_023_168,
    needBytes: 25 * GB,
    license: "Apache-2.0",
  },
];

export const DEFAULT_AI_MODEL_ID: AiModelId = "qwen3.5-9b";
/** Where EZ-Shop keeps the models it downloads, relative to the project. */
export const MODELS_DIR = ".data/models";

export function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === "string" && (AI_MODEL_IDS as readonly string[]).includes(value);
}

export function aiModel(id: AiModelId): AiModelSpec {
  const spec = AI_MODELS.find((model) => model.id === id);
  if (!spec) throw new Error(`Unknown model ${id}`);
  return spec;
}

/** The path EZ-Shop writes in LOCAL_AI_MODEL_PATH for a model of the catalogue. */
export function modelPathFor(spec: AiModelSpec): string {
  return `${MODELS_DIR}/${spec.file}`;
}

/** The catalogue entry a configured path points to, by its file name; null for a file of the owner's own. */
export function modelOfPath(modelPath: string): AiModelSpec | null {
  const file = path.basename(modelPath.replaceAll("\\", "/")).toLowerCase();
  return AI_MODELS.find((model) => model.file.toLowerCase() === file) ?? null;
}

/** Name and licence to show for the configured model: the file name when it is not one of the catalogue. */
export function modelInfoOf(modelPath: string): AiModelInfo {
  const spec = modelOfPath(modelPath);
  return spec ? { name: spec.name, license: spec.license } : { name: path.basename(modelPath.replaceAll("\\", "/")), license: "?" };
}
