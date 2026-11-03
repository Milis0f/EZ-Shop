import type { AiFit, AiMachine, AiModelChoice } from "@/domain/ai-settings";
import type { AiModelId, AiModelSpec } from "./models";

/**
 * How a model would run on this computer, from its estimated needs and the machine's memory. Rules of
 * thumb, stated as such on the page: other programs also use the memory and the graphics card.
 */

/** Share of the graphics card a model may take: the screen and other programs keep the rest. */
const VRAM_USABLE = 0.92;
/** Share of the computer's memory a model may take without starving the system and the browser. */
const RAM_USABLE = 0.6;

export function fitOf(needBytes: number, machine: AiMachine): AiFit {
  const gpu = machine.gpuMode === "auto" ? machine.gpu : null;
  const ram = machine.ramTotal * RAM_USABLE;
  if (gpu?.unified) return ram >= needBytes ? "fast" : "too_big";
  if (gpu && gpu.vramTotal * VRAM_USABLE >= needBytes) return "fast";
  if (gpu && gpu.vramTotal * VRAM_USABLE + ram >= needBytes) return "split";
  if (ram >= needBytes) return "cpu";
  return "too_big";
}

/**
 * The model to suggest: the largest that fits on the graphics card; without one, the largest shared
 * between card and memory; on the processor alone, the light one at most, the others being too slow.
 */
export function recommendedModel(models: readonly AiModelSpec[], machine: AiMachine): AiModelId | null {
  const fits = models.map((spec) => ({ spec, fit: fitOf(spec.needBytes, machine) }));
  const largest = (wanted: AiFit, allowed: (spec: AiModelSpec) => boolean = () => true) => fits.filter((f) => f.fit === wanted && allowed(f.spec)).at(-1)?.spec.id ?? null;
  return largest("fast") ?? largest("split") ?? largest("cpu", (spec) => spec.tier === "tiny" || spec.tier === "light");
}

export function modelChoices(models: readonly AiModelSpec[], machine: AiMachine, onDisk: readonly AiModelId[], active: AiModelId | null): AiModelChoice[] {
  const recommended = recommendedModel(models, machine);
  return models.map((spec) => ({
    id: spec.id,
    name: spec.name,
    tier: spec.tier,
    bytes: spec.bytes,
    needBytes: spec.needBytes,
    license: spec.license,
    onDisk: onDisk.includes(spec.id),
    active: spec.id === active,
    fit: fitOf(spec.needBytes, machine),
    recommended: spec.id === recommended,
  }));
}
