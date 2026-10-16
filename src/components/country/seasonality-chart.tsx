"use client";

import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const config = { index: { label: "Indice saisonnier", color: "var(--muted-foreground)" } } satisfies ChartConfig;

interface SeasonalityChartProps {
  readonly monthlyIndex: readonly number[];
  readonly peakMonths: readonly number[];
}

/** 12 multiplicative factors; 1 = average month. Peaks highlighted. */
export function SeasonalityChart({ monthlyIndex, peakMonths }: SeasonalityChartProps) {
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
              <div className="rounded-md border border-line bg-popover px-3 py-2 text-xs">
                <p className="font-medium capitalize">{p.name}</p>
                <p>{pct >= 0 ? `+${pct}` : pct} % par rapport au mois moyen</p>
              </div>
            );
          }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.peak ? "var(--foreground)" : "var(--muted-foreground)"} fillOpacity={d.peak ? 0.9 : 0.3} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
