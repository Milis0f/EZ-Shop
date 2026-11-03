import type { CountryCode } from "@/domain/country";
import { GRID_COLS, GRID_LETTERS, GRID_ROWS, GRID_STEP, WORLD_GRID } from "./world-grid";

/** Where the planet turns to for each country: a point well inside it, [longitude, latitude]. */
export const COUNTRY_CENTRE: Readonly<Record<CountryCode, readonly [number, number]>> = {
  FR: [2.5, 46.5],
  BE: [4.6, 50.6],
  CH: [8.2, 46.8],
  LU: [6.1, 49.8],
  DE: [10.4, 51.1],
  AT: [14.5, 47.6],
  NL: [5.3, 52.1],
  ES: [-3.7, 40.4],
  IT: [12.5, 42.8],
  PT: [-8.2, 39.6],
  IE: [-8, 53.2],
  PL: [19.1, 52],
  SE: [15, 62],
  DK: [9.5, 56],
  GB: [-2, 54],
  US: [-98, 39],
  CA: [-100, 57],
  AU: [134, -25],
};

/** What a cell of the grid holds at a longitude and latitude: ".", "#" or an analysed country's letter. */
export function cellAt(lon: number, lat: number): string {
  const row = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((90 - lat) / GRID_STEP)));
  const col = ((Math.floor((lon + 180) / GRID_STEP) % GRID_COLS) + GRID_COLS) % GRID_COLS;
  return WORLD_GRID[row]?.[col] ?? ".";
}

export function lettersOf(countries: readonly CountryCode[]): Set<string> {
  return new Set(countries.map((code) => GRID_LETTERS[code]));
}

const RAD = Math.PI / 180;

/**
 * Inverse orthographic projection: a point of the disc (x right, y up, radius 1) to the longitude and
 * latitude it shows when the planet faces (lon0, lat0). Null outside the disc.
 */
export function unproject(x: number, y: number, lon0: number, lat0: number): readonly [number, number] | null {
  const rho = Math.hypot(x, y);
  if (rho > 1) return null;
  if (rho === 0) return [lon0, lat0];
  const c = Math.asin(rho);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const phi0 = lat0 * RAD;
  const lat = Math.asin(cosC * Math.sin(phi0) + (y * sinC * Math.cos(phi0)) / rho) / RAD;
  const lon = lon0 + Math.atan2(x * sinC, rho * cosC * Math.cos(phi0) - y * sinC * Math.sin(phi0)) / RAD;
  return [((((lon + 180) % 360) + 360) % 360) - 180, lat];
}

/**
 * Orthographic projection: where a longitude and latitude show on the disc (x right, y up, radius 1)
 * when the planet faces (lon0, lat0). Null on the far side.
 */
export function project(lon: number, lat: number, lon0: number, lat0: number): readonly [number, number] | null {
  const phi = lat * RAD;
  const phi0 = lat0 * RAD;
  const dLon = (lon - lon0) * RAD;
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLon);
  if (cosC <= 0) return null;
  return [Math.cos(phi) * Math.sin(dLon), Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLon)];
}

/** The shortest turn from one longitude to another, in degrees (-180 to 180). */
export function shortestTurn(from: number, to: number): number {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}
