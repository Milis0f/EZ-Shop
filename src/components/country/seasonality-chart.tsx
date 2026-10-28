"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { motionDuration } from "@/components/motion/motion-tokens";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { advancedMessages, monthLong } from "@/components/data/labels";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useFormat } from "@/i18n/client";
import { INTL_LOCALES } from "@/i18n/config";
import { t } from "@/i18n/translate";

/** One-letter month initials on the axis, from the locale's narrow month names. */
const narrowMonth = (month: number, intlLocale: string) =>
  new Intl.DateTimeFormat(intlLocale, { month: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, month - 1, 15))).toLocaleUpperCase(intlLocale);

interface SeasonalityChartProps {
  readonly monthlyIndex: readonly number[];
  readonly peakMonths: readonly number[];
}

/** 12 multiplicative factors; 1 = average month. Peaks highlighted. The bars rise once, on the slow token. */
export function SeasonalityChart({ monthlyIndex, peakMonths }: SeasonalityChartProps) {
  const reducedMotion = useReducedMotion();
  const riseMs = useMemo(() => motionDuration("slow"), []);
  const f = useFormat();
  const m = advancedMessages(f.locale).seasonality;
  const config = useMemo(() => ({ index: { label: m.index, color: "var(--muted-foreground)" } }) satisfies ChartConfig, [m.index]);
  const intlLocale = INTL_LOCALES[f.locale];
  const data = monthlyIndex.map((value, i) => ({
    month: narrowMonth(i + 1, intlLocale),
    name: monthLong(i + 1, f.locale),
    value,
    peak: peakMonths.includes(i + 1),
  }));
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
                <p>{t(m.vsAverage, { pct: pct === 0 ? f.pct(0) : f.pct(pct, { signed: true }) })}</p>
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
