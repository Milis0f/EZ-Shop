import { useSyncExternalStore } from "react";
import type { CountryCode } from "@/domain/country";
import type { VerdictValue } from "@/engine/report/verdict";

/**
 * What the one planet of the app is doing, shared by the pages and the search forms: an analysis
 * running, or the countries the current page is about. The planet stays mounted across pages and
 * moves between places instead of appearing again.
 */

export interface PlanetAnalysis {
  readonly product: string;
  readonly countries: readonly CountryCode[];
  /** The form's own waiting message. */
  readonly message: string;
  readonly startedAt: number;
  /** How long such an analysis usually takes: the ring estimates its progress from it until real steps arrive. */
  readonly expectedMs: number;
  /** The phases of the analysis, in the order it runs them, shown one after the other when no real step is reported. */
  readonly phases: readonly string[];
  /** Real progress, 0 to 1, when the analysis reports it; null while it is only estimated. */
  readonly progress: number | null;
  /** What the analysis reports doing now; null while it reports nothing. */
  readonly step: string | null;
}

/** Usual length of an analysis when the form does not say. */
export const DEFAULT_EXPECTED_MS = 25_000;
/** An estimated ring never closes on its own: it waits there for the real end. */
const ESTIMATE_CEILING = 0.92;

/**
 * Progress shown on the ring: the real one when reported, otherwise an estimate that rises fast at
 * first, then slower, and never reaches the end before the analysis does.
 */
export function shownProgress(analysis: PlanetAnalysis, now: number): number {
  if (analysis.progress !== null) return Math.min(1, Math.max(0, analysis.progress));
  const elapsed = Math.max(0, now - analysis.startedAt);
  return ESTIMATE_CEILING * (1 - Math.exp((-2.3 * elapsed) / Math.max(1, analysis.expectedMs)));
}

/** The step to show: the reported one, else the phase the estimate has reached. */
export function shownStep(analysis: PlanetAnalysis, progress: number): string | null {
  if (analysis.step) return analysis.step;
  if (analysis.phases.length === 0) return null;
  const index = Math.min(analysis.phases.length - 1, Math.floor((progress / ESTIMATE_CEILING) * analysis.phases.length));
  return analysis.phases[index] ?? null;
}

export interface PlanetScene {
  /** The country the page is about: the planet faces it. */
  readonly focus: CountryCode;
  /** Countries lit and marked. */
  readonly countries: readonly CountryCode[];
  /** The verdict of the page's country: the planet's halo takes its colour. */
  readonly verdict?: VerdictValue;
  /** Real confidence score of that verdict, 0 to 100, written on the planet. */
  readonly confidence?: number;
}

/** A place in the page, in document pixels, where the planet comes to rest and states the verdict. */
export interface PlanetAnchor {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface PlanetState {
  readonly analysis: PlanetAnalysis | null;
  readonly scene: PlanetScene | null;
  readonly anchor: PlanetAnchor | null;
}

/** An analysis shows at least this long, so the planet completes its move instead of flashing. */
export const MIN_ANALYSIS_MS = 1_600;

let state: PlanetState = { analysis: null, scene: null, anchor: null };
let pendingEnd: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function publish(next: PlanetState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export interface AnalysisStart {
  readonly product: string;
  readonly countries: readonly CountryCode[];
  readonly message: string;
  readonly expectedMs?: number;
  readonly phases?: readonly string[];
}

export function startAnalysis(analysis: AnalysisStart, now: number = Date.now()): void {
  if (pendingEnd) clearTimeout(pendingEnd);
  pendingEnd = null;
  publish({ ...state, analysis: { expectedMs: DEFAULT_EXPECTED_MS, phases: [], ...analysis, startedAt: now, progress: null, step: null } });
}

/** What a streaming analysis reports as it goes: its real progress and current step. */
export function reportAnalysis(update: { readonly progress?: number | null; readonly step?: string | null }): void {
  const current = state.analysis;
  if (!current) return;
  publish({ ...state, analysis: { ...current, ...(update.progress !== undefined ? { progress: update.progress } : {}), ...(update.step !== undefined ? { step: update.step } : {}) } });
}

/** Ends the analysis once it has shown for the minimum time. */
export function endAnalysis(now: number = Date.now(), schedule: (run: () => void, ms: number) => unknown = setTimeout): void {
  const current = state.analysis;
  if (!current) return;
  const left = current.startedAt + MIN_ANALYSIS_MS - now;
  const finish = () => {
    pendingEnd = null;
    if (state.analysis === current) publish({ ...state, analysis: null });
  };
  if (left <= 0) finish();
  else pendingEnd = schedule(finish, left) as ReturnType<typeof setTimeout>;
}

export function setPlanetScene(scene: PlanetScene | null): void {
  if (state.scene === scene) return;
  publish({ ...state, scene });
}

export function setPlanetAnchor(anchor: PlanetAnchor | null): void {
  const current = state.anchor;
  if (current === anchor || (current && anchor && current.x === anchor.x && current.y === anchor.y && current.size === anchor.size)) return;
  publish({ ...state, anchor });
}

export const getPlanetState = (): PlanetState => state;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const SERVER_STATE: PlanetState = { analysis: null, scene: null, anchor: null };

export function usePlanetState(): PlanetState {
  return useSyncExternalStore(subscribe, getPlanetState, () => SERVER_STATE);
}
