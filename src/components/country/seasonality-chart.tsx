"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { motionDuration } from "@/components/motion/motion-tokens";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const config = { index: { label: "Indice saisonnier", color: "var(--muted-foreground)" } } satisfies ChartConfig;

interface SeasonalityChartProps {
  readonly monthlyIndex: readonly number[];
  readonly peakMonths: readonly number[];
}

/** 12 multiplicative factors; 1 = average month. Peaks highlighted. The bars rise once, on the slow token. */
export function SeasonalityChart({ monthlyIndex, peakMonths }: SeasonalityChartProps) {
  const reducedMotion = useReducedMotion();
  const riseMs = useMemo(() => motionDuration("slow"), []);
  const data = monthlyIndex.map((value, i) => ({ month: MONTHS[i], name: MONTH_NAMES[i], value, peak: peakMonths.includes(i + 1) }));
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <XAxis dataKey="month" tickLine={false} axisLine={false} interval={0} />
        <YAxis hide domain={[0, "dataMax"]} />
        <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
        <Tooltip
          cursor={{ fill: "var(--surface-2)" }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!p) return null;
            const pct = Math.round((p.value - 1) * 100);
            return (
              <div className="rounded-menu border border-line bg-popover px-3.5 py-2.5 text-xs">
                <p className="font-medium capitalize">{p.name}</p>
                <p>{pct >= 0 ? `+${pct}` : pct} % par rapport au mois moyen</p>
              </div>
            );
          }}
        />
        <Bar dataKey="value" radius={[999, 999, 999, 999]} isAnimationActive={!reducedMotion} animationDuration={riseMs} animationEasing="ease-out">
          {data.map((d) => (
            <Cell key={d.name} fill={d.peak ? "var(--foreground)" : "var(--muted-foreground)"} fillOpacity={d.peak ? 0.9 : 0.3} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
