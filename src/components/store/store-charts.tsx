"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SimpleTable } from "@/components/web/web-visuals";
import "./store-charts.css";

/**
 * The store's charts: plain SVG, one y-axis from zero, a crosshair that reads every series at the
 * pointed day (also with the arrow keys), a legend with line keys and the same figures as a table.
 * Series colours were checked for colour-blind separation and contrast on the panel surface.
 */

export interface TrendSeries {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** Slot of the fixed series order: 1 blue, 2 orange, 3 aqua. */
  readonly slot: 1 | 2 | 3;
  /** The same measure over the period before: drawn dashed and lighter, in its series' own colour. */
  readonly dashed?: boolean;
}

export interface TrendChartProps {
  readonly title: string;
  readonly days: readonly string[];
  readonly series: readonly TrendSeries[];
  readonly formatValue: (value: number) => string;
  readonly formatDay: (day: string) => string;
  readonly tableLabel: string;
  readonly dayLabel: string;
  /** Counts: the axis only shows whole numbers. */
  readonly whole?: boolean;
}

/** Drawn at the width it is shown at, so the axis text keeps its size on a phone; this until it is measured. */
const DEFAULT_W = 600;
const MIN_W = 260;
const H = 190;
const PAD = { left: 40, right: 10, top: 12, bottom: 24 } as const;
const PLOT_H = H - PAD.top - PAD.bottom;

/** The width of an element, followed as it changes. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const measured = Math.round(entry?.contentRect.width ?? 0);
      if (measured > 0) setWidth(Math.max(MIN_W, measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** A round top for the axis: 1, 2 or 5 times a power of ten, at least the highest value. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

export function TrendChart({ title, days, series, formatValue, formatDay, tableLabel, dayLabel, whole = false }: TrendChartProps) {
  const id = useId();
  const [frame, W] = useWidth<HTMLDivElement>();
  const PLOT_W = W - PAD.left - PAD.right;
  const [index, setIndex] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const step = days.length > 1 ? PLOT_W / (days.length - 1) : 0;
  const x = (i: number) => PAD.left + (days.length > 1 ? i * step : PLOT_W / 2);
  const y = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;
  const ticks = [0, top / 2, top].filter((tick) => !whole || Number.isInteger(tick));
  const labelled = days.length > 2 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : days.map((_, i) => i);

  function point(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const local = ((event.clientX - box.left) / box.width) * W;
    const i = step > 0 ? Math.round((local - PAD.left) / step) : 0;
    setIndex(Math.min(days.length - 1, Math.max(0, i)));
  }

  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const from = index ?? days.length - 1;
    setIndex(Math.min(days.length - 1, Math.max(0, from + (event.key === "ArrowRight" ? 1 : -1))));
  }

  const shown = index !== null && days[index] !== undefined ? index : null;
  const tipLeft = shown === null ? 0 : (x(shown) / W) * 100;

  return (
    <figure className="store-chart flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="text-sm font-medium">
        {title}
      </figcaption>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="store-chart-key" data-slot={s.slot} data-dashed={s.dashed || undefined} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div
        ref={frame}
        className="store-chart-frame relative rounded-tile outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="group"
        aria-label={`${title}. ${dayLabel}`}
        onKeyDown={keys}
        onFocus={() => setIndex((current) => current ?? days.length - 1)}
        onBlur={() => setIndex(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full touch-pan-y" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setIndex(null)} aria-hidden>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="store-chart-grid" />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="store-chart-axis">
                {formatValue(tick)}
              </text>
            </g>
          ))}
          {labelled.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="store-chart-axis">
              {formatDay(days[i] ?? "")}
            </text>
          ))}
          {series[0] && days.length > 1 && (
            <path
              d={`M${x(0)},${y(0)} ${series[0].values.map((v, i) => `L${x(i)},${y(v)}`).join(" ")} L${x(days.length - 1)},${y(0)} Z`}
              className="store-chart-wash"
              data-slot={series[0].slot}
            />
          )}
          {series.map((s) => (
            <polyline key={s.key} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} className="store-chart-line" data-slot={s.slot} data-dashed={s.dashed || undefined} />
          ))}
          {shown !== null && (
            <g>
              <line x1={x(shown)} x2={x(shown)} y1={PAD.top} y2={PAD.top + PLOT_H} className="store-chart-cross" />
              {series.map((s) => (
                <circle key={s.key} cx={x(shown)} cy={y(s.values[shown] ?? 0)} r={4} className="store-chart-dot" data-slot={s.slot} />
              ))}
            </g>
          )}
        </svg>
        {shown !== null && (
          <div
            role="status"
            className="store-chart-tip pointer-events-none absolute top-2 z-10 min-w-36 rounded-tile border border-line px-3 py-2 text-xs"
            style={{ left: `${tipLeft}%`, transform: `translateX(${tipLeft > 60 ? "calc(-100% - 12px)" : "12px"})` }}
          >
            <p className="mb-1.5 text-muted-foreground">{formatDay(days[shown] ?? "")}</p>
            <ul className="flex flex-col gap-1">
              {series.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span aria-hidden className="store-chart-key" data-slot={s.slot} data-dashed={s.dashed || undefined} />
                  <span className="tabular font-semibold">{formatValue(s.values[shown] ?? 0)}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground underline decoration-line underline-offset-4 hover:text-foreground">{tableLabel}</summary>
        <div className="mt-3 max-h-72 overflow-y-auto">
          <SimpleTable
            columns={[dayLabel, ...series.map((s) => s.label)]}
            rows={days.map((day, i) => ({ key: day, cells: [formatDay(day), ...series.map((s) => formatValue(s.values[i] ?? 0))] }))}
          />
        </div>
      </details>
    </figure>
  );
}

export interface FunnelStepView {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly display: string;
  /** "8.3 % of the step before", written by the caller; absent for the first step. */
  readonly rate?: string;
}

/** The steps of a visit, each bar measured against the first step, with the share kept from one step to the next. */
export function Funnel({ title, steps }: { readonly title: string; readonly steps: readonly FunnelStepView[] }) {
  const first = steps[0]?.value ?? 0;
  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <ol className="flex flex-col gap-1">
        {steps.map((step, i) => (
          <li key={step.key} className="flex flex-col gap-1.5">
            {i > 0 && step.rate && (
              <p className="flex items-center gap-2 pl-1 font-mono text-[11px] tracking-[-0.02em] text-muted-foreground">
                <span aria-hidden>↓</span>
                {step.rate}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-4 text-xs">
              <span className="text-muted-foreground">{step.label}</span>
              <span className="tabular text-base font-semibold">{step.display}</span>
            </div>
            <div className="store-funnel-track" aria-hidden>
              <div className="store-funnel-fill" style={{ width: `${first > 0 ? Math.max(step.value > 0 ? 1.5 : 0, (step.value / first) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** A small line of a figure's last days, beside the figure itself: no axis, the number is written next to it. */
export function Sparkline({ values, slot = 1, className }: { readonly values: readonly number[]; readonly slot?: 1 | 2 | 3 | 4 | 5; readonly className?: string }) {
  const w = 120;
  const h = 36;
  if (values.length < 2) return null;
  const top = Math.max(0, ...values);
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => (top > 0 ? h - 3 - (v / top) * (h - 6) : h - 3);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`store-chart block h-9 w-full ${className ?? ""}`} aria-hidden>
      <g data-slot={slot}>
        <path d={`M0,${h} L${points.join(" L")} L${w},${h} Z`} className="store-chart-wash" />
        <polyline points={points.join(" ")} className="store-chart-line store-spark-line" />
      </g>
    </svg>
  );
}

export interface DonutSlice {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly display: string;
}

/**
 * Shares of one whole: at most five slices in the fixed colour order (the caller folds the rest into
 * the last one), 2px gaps between slices, the total in the middle, and a legend with every value.
 */
export function Donut({ title, slices, total, totalLabel }: { readonly title: string; readonly slices: readonly DonutSlice[]; readonly total: string; readonly totalLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const sum = slices.reduce((acc, slice) => acc + slice.value, 0);
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2.5 : 0;
  const starts = slices.reduce<number[]>((acc, slice, i) => [...acc, (acc[i] ?? 0) + (sum > 0 ? (slice.value / sum) * circumference : 0)], [0]);
  const shown = active !== null ? slices[active] : null;
  return (
    <figure className="store-chart flex flex-col gap-4">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="flex flex-col items-center gap-5 min-[520px]:flex-row">
        <div className="relative size-40 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={r} className="store-donut-track" />
            {sum > 0 &&
              slices.map((slice, i) => {
                const length = (slice.value / sum) * circumference;
                const dash = Math.max(0.5, length - gap);
                return (
                  <circle
                    key={slice.key}
                    cx="50"
                    cy="50"
                    r={r}
                    data-slot={Math.min(5, i + 1)}
                    className="store-donut-slice"
                    data-dim={active !== null && active !== i ? "" : undefined}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-(starts[i] ?? 0)}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                  />
                );
              })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="tabular font-mono text-xl font-semibold tracking-[-0.04em]">{shown ? shown.display : total}</span>
            <span className="max-w-24 truncate text-[11px] text-muted-foreground">{shown ? shown.label : totalLabel}</span>
          </div>
        </div>
        <ul className="flex w-full flex-col gap-1 text-sm">
          {slices.map((slice, i) => (
            <li key={slice.key}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-tile px-2 py-1.5 text-left hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] focus-visible:outline-none"
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="store-donut-key" data-slot={Math.min(5, i + 1)} />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {slice.display}
                  {sum > 0 && <span className="ml-2 text-xs">{Math.round((slice.value / sum) * 100)} %</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
