"use client";

import { useCallback, useMemo, type Ref } from "react";
import { Area, CartesianGrid, ComposedChart, Curve, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { drawPathClassName, useDrawPath } from "@/components/motion/draw-path";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { DemandBasis, ForecastPoint, MonthlyPoint } from "@/domain/market";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";

interface DemandChartProps {
  readonly basis: DemandBasis;
  readonly history: readonly MonthlyPoint[];
  readonly forecast: readonly ForecastPoint[] | null;
}

interface Row {
  month: string;
  observed?: number;
  p50?: number;
  band?: [number, number];
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${m}/${y.slice(2)}`;
};

type CurveProps = React.ComponentProps<typeof Curve>;

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.RefObject<T | null>).current = node;
}

/**
 * The observed line, drawn once when it first scrolls into view (DrawPath from the motion kit).
 * Recharts clones this element with the curve props, its own pathRef included, which is kept.
 */
function ObservedCurve(props: CurveProps) {
  const { pathRef, className, ...rest } = props;
  const draw = useDrawPath<SVGPathElement>();
  const ref = useCallback(
    (node: SVGPathElement | null) => {
      assignRef(pathRef, node);
      return draw(node);
    },
    [pathRef, draw],
  );
  return <Curve {...rest} className={[className, drawPathClassName].filter(Boolean).join(" ")} pathRef={ref} />;
}

export function DemandChart({ basis, history, forecast }: DemandChartProps) {
  const m = useMessages("report").chart;
  const f = useFormat();
  const config = useMemo(
    () =>
      ({
        observed: { label: m.observed, color: "var(--kind-observed)" },
        p50: { label: m.p50, color: "var(--kind-estimate)" },
        band: { label: m.band, color: "var(--kind-estimate)" },
      }) satisfies ChartConfig,
    [m],
  );
  const nf = (v: number) => f.number(v, { notation: "compact", maximumFractionDigits: 1 });
  const rows: Row[] = history.map((p) => ({ month: p.month, observed: p.value }));
  const last = history[history.length - 1];
  if (forecast && forecast.length > 0 && last) {
    // Anchor the projection on the last observed point so the two lines connect.
    rows[rows.length - 1] = { ...rows[rows.length - 1], p50: last.value, band: [last.value, last.value] };
    for (const p of forecast) rows.push({ month: p.month, p50: p.p50, band: [p.p10, p.p90] });
  }
  const unit =
    basis === "absolute_volume"
      ? m.unitSearches
      : basis === "topic_interest"
        ? m.unitWikipedia
        : m.unitIndex;

  return (
    <figure>
      <ChartContainer config={config} className="aspect-auto h-72 w-full">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} minTickGap={28} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
          <YAxis tickFormatter={(v: number) => nf(v)} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--ink-muted)", fontSize: 12 }} />
          <Tooltip
            cursor={{ stroke: "var(--trait)" }}
            content={({ payload, label }) => {
              const row = payload?.[0]?.payload as Row | undefined;
              if (!row) return null;
              return (
                <div className="tabular rounded-menu border border-line bg-popover px-3 py-2 text-xs">
                  <p className="font-medium">{label}</p>
                  {row.observed !== undefined && <p className="text-kind-observed">{t(m.observedValue, { value: nf(row.observed) })}</p>}
                  {row.p50 !== undefined && row.observed === undefined && (
                    <>
                      <p className="text-kind-estimate">{t(m.p50Value, { value: nf(row.p50) })}</p>
                      {row.band && <p className="opacity-80">{t(m.bandValue, { low: nf(row.band[0]), high: nf(row.band[1]) })}</p>}
                    </>
                  )}
                </div>
              );
            }}
          />
          {forecast && last && <ReferenceLine x={last.month} stroke="var(--line)" strokeDasharray="3 3" />}
          <Area dataKey="band" stroke="none" fill="var(--craie)" fillOpacity={0.06} isAnimationActive={false} connectNulls={false} />
          <Line
            dataKey="observed"
            stroke="var(--color-observed)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: "var(--craie)", stroke: "var(--noir)", strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
            shape={<ObservedCurve />}
          />
          <Line dataKey="p50" stroke="var(--color-p50)" strokeWidth={2} strokeDasharray="5 6" strokeLinecap="round" dot={false} activeDot={{ r: 4, fill: "var(--brume)", stroke: "var(--noir)", strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ChartContainer>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>{unit}</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-pill bg-kind-observed" /> {m.legendObserved}
        </span>
        {forecast && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-kind-estimate" /> {m.legendProjection}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
