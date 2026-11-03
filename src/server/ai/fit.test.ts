import { describe, expect, it } from "vitest";
import type { AiMachine } from "@/domain/ai-settings";
import { fitOf, modelChoices, recommendedModel } from "./fit";
import { AI_MODELS, aiModel, isAiModelId, modelInfoOf, modelOfPath, modelPathFor } from "./models";

const GB = 1_000_000_000;

const machine = (ramGb: number, vramGb: number | null, extra: Partial<AiMachine> = {}): AiMachine => ({
  ramTotal: ramGb * GB,
  ramFree: ramGb * GB * 0.5,
  cpu: "Test CPU",
  threads: 16,
  gpu: vramGb === null ? null : { backend: "cuda", names: ["Test GPU"], vramTotal: vramGb * GB, vramUsed: 0, vramFree: vramGb * GB, unified: false },
  gpuProbe: vramGb === null ? "none" : "ok",
  ai: null,
  gpuMode: "auto",
  diskFree: 100 * GB,
  ...extra,
});

describe("the model catalogue", () => {
  it("lists the models from the smallest to the largest, each with a checksum", () => {
    const sizes = AI_MODELS.map((model) => model.bytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    for (const model of AI_MODELS) {
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(model.url).toMatch(/^https:\/\/huggingface\.co\/unsloth\/.+\/resolve\/main\/.+\.gguf$/);
      expect(model.url.endsWith(model.file)).toBe(true);
      expect(model.needBytes).toBeGreaterThan(model.bytes);
    }
  });

  it("finds a model by its file, whatever the folder and the case", () => {
    expect(modelOfPath("D:\\models\\qwen3.5-4b-q4_k_m.gguf")?.id).toBe("qwen3.5-4b");
    expect(modelOfPath(".data/models/other.gguf")).toBeNull();
    expect(modelInfoOf(".data/models/other.gguf")).toEqual({ name: "other.gguf", license: "?" });
    expect(modelPathFor(aiModel("qwen3.5-2b"))).toBe(".data/models/Qwen3.5-2B-Q4_K_M.gguf");
    expect(isAiModelId("qwen3.5-9b")).toBe(true);
    expect(isAiModelId("../../etc/passwd")).toBe(false);
  });
});

describe("how a model runs on this computer", () => {
  it("is fast on a card big enough, split beyond it, on the processor without one", () => {
    const nine = aiModel("qwen3.5-9b").needBytes;
    expect(fitOf(nine, machine(32, 12))).toBe("fast");
    expect(fitOf(nine, machine(32, 4))).toBe("split");
    expect(fitOf(nine, machine(32, null))).toBe("cpu");
    expect(fitOf(nine, machine(8, null))).toBe("too_big");
  });

  it("ignores the card when the AI is kept off it", () => {
    expect(fitOf(aiModel("qwen3.5-9b").needBytes, machine(32, 12, { gpuMode: "off" }))).toBe("cpu");
  });

  it("counts the shared memory of an integrated card once", () => {
    const unified = machine(16, 16, { gpu: { backend: "metal", names: ["Apple M2"], vramTotal: 16 * GB, vramUsed: 0, vramFree: 16 * GB, unified: true } });
    expect(fitOf(aiModel("qwen3.5-4b").needBytes, unified)).toBe("fast");
    expect(fitOf(aiModel("qwen3.8-27b").needBytes, unified)).toBe("too_big");
  });

  it("suggests the largest model the card holds, a light one on the processor alone", () => {
    expect(recommendedModel(AI_MODELS, machine(32, 8))).toBe("qwen3.5-9b");
    expect(recommendedModel(AI_MODELS, machine(64, 32))).toBe("qwen3.8-27b");
    // A 12 GB card holds the 9B whole; the 27B would be split with memory.
    expect(recommendedModel(AI_MODELS, machine(32, 12))).toBe("qwen3.5-9b");
    expect(fitOf(aiModel("qwen3.8-27b").needBytes, machine(32, 12))).toBe("split");
    expect(recommendedModel(AI_MODELS, machine(32, null))).toBe("qwen3.5-4b");
    expect(recommendedModel(AI_MODELS, machine(4, null))).toBe("qwen3.5-2b");
    expect(recommendedModel(AI_MODELS, machine(2, null))).toBeNull();
  });

  it("marks the models on disk, the one in use and the suggestion", () => {
    const choices = modelChoices(AI_MODELS, machine(32, 8), ["qwen3.5-9b", "qwen3.5-2b"], "qwen3.5-9b");
    expect(choices.filter((c) => c.onDisk).map((c) => c.id)).toEqual(["qwen3.5-2b", "qwen3.5-9b"]);
    expect(choices.find((c) => c.active)?.id).toBe("qwen3.5-9b");
    expect(choices.filter((c) => c.recommended).map((c) => c.id)).toEqual(["qwen3.5-9b"]);
  });
});

describe("fewerLayers", () => {
  const vram = new Error("A context size of 8192 is too large for the available VRAM");
  it("keeps a fifth fewer layers on the card after a card-memory error", async () => {
    const { fewerLayers } = await import("./engine");
    expect(fewerLayers(37, vram, 1)).toBe(29);
  });
  it("gives up on other errors, with nothing left on the card, or after five tries", async () => {
    const { fewerLayers } = await import("./engine");
    expect(fewerLayers(37, new Error("bad file"), 1)).toBeNull();
    expect(fewerLayers(0, vram, 1)).toBeNull();
    expect(fewerLayers(undefined, vram, 1)).toBeNull();
    expect(fewerLayers(20, vram, 5)).toBeNull();
  });
});
