/**
 * What the settings page shows about the local AI on this computer: its memory, its graphics card, the
 * share the loaded model takes, and how each model of the catalogue would run here.
 */

export interface AiGpu {
  /** cuda, vulkan or metal: the backend node-llama-cpp found. */
  readonly backend: string;
  readonly names: readonly string[];
  readonly vramTotal: number;
  readonly vramUsed: number;
  readonly vramFree: number;
  /** The card shares the computer's memory (integrated graphics, Apple chips). */
  readonly unified: boolean;
}

export interface AiMachine {
  readonly ramTotal: number;
  readonly ramFree: number;
  readonly cpu: string;
  readonly threads: number;
  /** Null when no graphics card could be used, or when it could not be read. */
  readonly gpu: AiGpu | null;
  /** ok: the card was read; none: no usable card; failed: it could not be read. */
  readonly gpuProbe: "ok" | "none" | "failed";
  /** Memory the loaded model takes right now; null when no model is loaded. */
  readonly ai: { readonly vram: number; readonly ram: number } | null;
  readonly gpuMode: "auto" | "off";
  /** Free disk space where models are stored; null when unknown. */
  readonly diskFree: number | null;
}

/** fast: fits on the graphics card; split: shared between card and memory, slower; cpu: processor only, slow; too_big. */
export const AI_FITS = ["fast", "split", "cpu", "too_big"] as const;
export type AiFit = (typeof AI_FITS)[number];

export interface AiModelChoice {
  readonly id: string;
  readonly name: string;
  readonly tier: "tiny" | "light" | "balanced" | "strong";
  readonly bytes: number;
  readonly needBytes: number;
  readonly license: string;
  readonly onDisk: boolean;
  readonly active: boolean;
  readonly fit: AiFit;
  readonly recommended: boolean;
}
