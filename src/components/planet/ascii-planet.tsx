"use client";

import { useEffect, useRef } from "react";
import type { CountryCode } from "@/domain/country";
import { cn } from "@/lib/utils";
import { cellAt, COUNTRY_CENTRE, lettersOf, project, shortestTurn, unproject } from "./globe-math";

/** Characters from dark to bright. Land climbs the ramp with the light, sea stays dots. */
const RAMP = ".:-=+*#%@";
const FRAME_MS = 1000 / 30;
/** Degrees a second while the planet drifts. */
const DRIFT_SPEED = 7;
const DRIFT_TILT = 18;
/** Time spent facing each country while scanning. */
const SCAN_HOLD_MS = 1800;
/** A light from the upper left, towards the viewer. */
const LIGHT = (() => {
  const v = [-0.5, 0.55, 0.67];
  const n = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((x) => x / n) as [number, number, number];
})();
const ALPHA_LEVELS = 10;
/** One pulse of a country marker, in ms. */
const MARKER_PULSE_MS = 1600;

export type PlanetMode = "drift" | "scan" | "focus";

export interface AsciiPlanetProps {
  /**
   * drift: turns slowly on its own; scan: visits each focus country in turn with a sweeping line;
   * focus: turns to the first focus country (or to `facing`) and stays.
   */
  readonly mode?: PlanetMode;
  /** Countries drawn bright, in white. */
  readonly highlight?: readonly CountryCode[];
  /** Countries to face, in order. */
  readonly focus?: readonly CountryCode[];
  /** A place to face instead of a country, [longitude, latitude]: a region of the world for a page. */
  readonly facing?: readonly [number, number] | null;
  /** Countries marked by a pulsing point, the one faced while scanning named by its code. */
  readonly markers?: readonly CountryCode[];
  /** Character size in CSS pixels: smaller is more detailed. */
  readonly fontSize?: number;
  /** Told which country faces the viewer while scanning. */
  readonly onFace?: (country: CountryCode) => void;
  readonly className?: string;
}

interface View {
  lon: number;
  lat: number;
}

const EMPTY: readonly CountryCode[] = [];

/**
 * The Earth in white and grey characters on black, with the real outline of every country. Drawn on a
 * canvas, at most 30 times a second, and only while on screen. Props change the picture smoothly: the
 * planet turns to its new place instead of jumping. Under reduced motion it is one still picture.
 */
export function AsciiPlanet({ mode = "drift", highlight = EMPTY, focus = EMPTY, facing = null, markers = EMPTY, fontSize = 9, onFace, className }: AsciiPlanetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ mode, highlight, focus, facing, markers, fontSize, onFace });
  const redraw = useRef<(() => void) | null>(null);
  // The drawing loop reads the latest props without restarting; a still planet is drawn again.
  useEffect(() => {
    settings.current = { mode, highlight, focus, facing, markers, fontSize, onFace };
    redraw.current?.();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";
    const first = settings.current.focus[0];
    const view: View = first ? { lon: COUNTRY_CENTRE[first][0], lat: COUNTRY_CENTRE[first][1] * 0.6 } : { lon: 10, lat: DRIFT_TILT };
    let width = 0;
    let height = 0;
    let frame = 0;
    let last = 0;
    let visible = true;
    let faced: CountryCode | null = null;
    // A new list of countries starts its visit from the first one.
    let scanKey = "";
    let scanStart = 0;

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const target = (now: number): View | null => {
      const { mode: current, focus: countries, facing: place } = settings.current;
      if (current === "drift") {
        faced = null;
        return null;
      }
      if (place && current === "focus") return { lon: place[0], lat: place[1] };
      if (countries.length === 0) return null;
      const key = countries.join();
      if (key !== scanKey) {
        scanKey = key;
        scanStart = now;
      }
      const index = current === "scan" ? Math.floor((now - scanStart) / SCAN_HOLD_MS) % countries.length : 0;
      const country = countries[index] ?? countries[0];
      if (!country) return null;
      if (country !== faced) {
        faced = country;
        settings.current.onFace?.(country);
      }
      const [lon, lat] = COUNTRY_CENTRE[country];
      // Facing a country from a little above reads better than straight on.
      return { lon, lat: Math.max(-40, Math.min(55, lat * 0.75)) };
    };

    const drawMarkers = (now: number, cx: number, cy: number, radius: number, size: number) => {
      const { markers: marked, mode: current } = settings.current;
      if (marked.length === 0) return;
      context.lineWidth = 1;
      for (const country of marked) {
        const [lon, lat] = COUNTRY_CENTRE[country];
        const point = project(lon, lat, view.lon, view.lat);
        if (!point) continue;
        const x = cx + point[0] * radius;
        const y = cy - point[1] * radius;
        const main = current !== "drift" && country === faced;
        const phase = still ? 0.5 : ((now + country.charCodeAt(0) * 97) % MARKER_PULSE_MS) / MARKER_PULSE_MS;
        // The point, and a ring that widens and fades from it.
        context.fillStyle = "#fff";
        context.beginPath();
        context.arc(x, y, main ? 3.2 : 2.2, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `rgba(255, 255, 255, ${(1 - phase) * (main ? 0.9 : 0.55)})`;
        context.beginPath();
        context.arc(x, y, (main ? 6 : 4) + phase * (main ? 22 : 12), 0, Math.PI * 2);
        context.stroke();
        if (main) {
          // A short leader and the country code, as a radar would name its target.
          context.strokeStyle = "rgba(255, 255, 255, 0.7)";
          context.beginPath();
          context.moveTo(x + 5, y - 5);
          context.lineTo(x + 26, y - 26);
          context.lineTo(x + 46, y - 26);
          context.stroke();
          context.font = `700 ${Math.max(11, size * 1.3)}px ${family}`;
          context.fillStyle = "#fff";
          context.textAlign = "left";
          context.fillText(`[${country}]`, x + 50, y - 26);
        }
      }
    };

    const draw = (now: number, dt: number) => {
      const { fontSize: size, highlight: bright, mode: current } = settings.current;
      const goal = target(now);
      if (still && goal) {
        view.lon = goal.lon;
        view.lat = goal.lat;
      } else if (goal) {
        const ease = 1 - Math.exp(-dt / 420);
        view.lon += shortestTurn(view.lon, goal.lon) * ease;
        view.lat += (goal.lat - view.lat) * ease;
      } else if (!still) {
        view.lon += (DRIFT_SPEED * dt) / 1000;
        view.lat += (DRIFT_TILT - view.lat) * (1 - Math.exp(-dt / 900));
      }

      context.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) / 2;
      const cx = width / 2;
      const cy = height / 2;
      const charW = size * 0.62;
      const charH = size * 1.18;
      const cols = Math.floor(width / charW);
      const rows = Math.floor(height / charH);
      const offsetX = (width - cols * charW) / 2;
      const offsetY = (height - rows * charH) / 2;
      const lit = lettersOf(bright);
      const sweep = current === "scan" && !still ? Math.sin(now / 520) * 0.92 : null;
      const pulse = still ? 1 : 0.82 + 0.18 * Math.sin(now / 260);
      const buckets: Array<Array<[string, number, number]>> = Array.from({ length: ALPHA_LEVELS + 1 }, () => []);
      const whites: Array<[string, number, number]> = [];

      for (let row = 0; row < rows; row += 1) {
        const py = offsetY + (row + 0.5) * charH;
        const y = (cy - py) / radius;
        for (let col = 0; col < cols; col += 1) {
          const px = offsetX + (col + 0.5) * charW;
          const x = (px - cx) / radius;
          const rho2 = x * x + y * y;
          if (rho2 > 1) continue;
          const point = unproject(x, y, view.lon, view.lat);
          if (!point) continue;
          const z = Math.sqrt(1 - rho2);
          const light = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
          const cell = cellAt(point[0], point[1]);
          const scanned = sweep !== null && Math.abs(y - sweep) < 0.035;

          if (cell !== "." && lit.has(cell)) {
            whites.push([RAMP[Math.min(RAMP.length - 1, 6 + Math.round(light * 2))] ?? "@", px, py]);
            continue;
          }
          let char: string;
          let alpha: number;
          if (cell !== ".") {
            const level = 0.08 + 0.92 * light ** 1.5;
            char = RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length))] ?? "#";
            alpha = 0.14 + level * 0.74;
          } else {
            // Sea: a faint graticule every 15 degrees, and the rim of the disc.
            const onLine = Math.abs(((point[1] % 15) + 15) % 15) < 0.7 || Math.abs(((point[0] % 15) + 15) % 15) < 0.7;
            const rim = rho2 > 0.9;
            if (!onLine && !rim && !scanned) continue;
            char = rim ? ":" : ".";
            alpha = (rim ? 0.24 : 0.13) + light * 0.14;
          }
          if (scanned) {
            char = cell === "." ? "-" : "=";
            alpha = Math.min(1, alpha + 0.45);
          }
          buckets[Math.round(Math.min(1, alpha) * ALPHA_LEVELS)]?.push([char, px, py]);
        }
      }

      context.font = `500 ${size}px ${family}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      buckets.forEach((cells, level) => {
        if (cells.length === 0) return;
        context.fillStyle = `rgba(214, 214, 220, ${level / ALPHA_LEVELS})`;
        for (const [char, px, py] of cells) context.fillText(char, px, py);
      });
      if (whites.length) {
        context.font = `700 ${size}px ${family}`;
        context.fillStyle = `rgba(255, 255, 255, ${pulse})`;
        for (const [char, px, py] of whites) context.fillText(char, px, py);
      }
      drawMarkers(now, cx, cy, radius, size);
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      if (now - last < FRAME_MS) return;
      const dt = last ? Math.min(100, now - last) : FRAME_MS;
      last = now;
      draw(now, dt);
    };

    resize();
    redraw.current = still ? () => draw(performance.now(), 0) : null;
    const observer = new ResizeObserver(() => {
      resize();
      if (still) draw(performance.now(), 0);
    });
    observer.observe(canvas);
    const onScreen = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    onScreen.observe(canvas);
    // Fonts can arrive after the first frame: draw again once they are there.
    void document.fonts?.ready.then(() => still && draw(performance.now(), 0));

    if (still) draw(performance.now(), 0);
    else frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      onScreen.disconnect();
      redraw.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={cn("block size-full", className)} />;
}
