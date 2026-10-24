"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { CartesianGrid, LabelList, ReferenceArea, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { motionDuration } from "@/components/motion/motion-tokens";
import { useReducedMotion } from "@/components/motion/use-reduced-motion";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

export interface MapPoint {
  readonly code: string;
  readonly name: string;
  readonly score: number;
  readonly confidence: number;
  readonly mock: boolean;
}

interface OpportunityMapProps {
  readonly analysisId: string;
  readonly points: readonly MapPoint[];
  readonly thresholds: { readonly prioritizeScore: number; readonly prioritizeConfidence: number; readonly testScore: number; readonly minConfidence: number };
}

const config = { score: { label: "Score", color: "var(--foreground)" } } satisfies ChartConfig;

/** Neighbouring points closer than this (axis units) are labelled together; positions are never moved. */
const MERGE = { confidence: 5, score: 4 } as const;

type LabelledPoint = MapPoint & { label: string; labelBelow: boolean };

/**
 * Single-linkage clusters along the confidence axis. A lone point is labelled above itself;
 * a cluster gets one label ("ES, US, CA") below its right-most point, so labels never collide.
 */
function withClusterLabels(points: readonly MapPoint[]): LabelledPoint[] {
  const sorted = points.toSorted((a, b) => a.confidence - b.confidence || a.score - b.score);
  const clusters: MapPoint[][] = [];
  for (const p of sorted) {
    const cluster = clusters.find((c) =>
      c.some((q) => Math.abs(q.confidence - p.confidence) <= MERGE.confidence && Math.abs(q.score - p.score) <= MERGE.score),
    );
    if (cluster) cluster.push(p);
    else clusters.push([p]);
  }
  const labels = new Map<string, { label: string; labelBelow: boolean }>();
  for (const c of clusters) {
    const anchor = c.reduce((best, p) => (p.confidence > best.confidence ? p : best), c[0]);
    labels.set(anchor.code, { label: c.map((p) => p.code).join(", "), labelBelow: c.length > 1 });
  }
  return sorted.map((p) => ({ ...p, ...(labels.get(p.code) ?? { label: "", labelBelow: false }) }));
}

/**
 * Opportunity (y) against confidence (x): two independent axes, never merged.
 * Zones mirror the decision rules of the engine.
 */
export function OpportunityMap({ analysisId, points, thresholds }: OpportunityMapProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  // The points draw in once, on the slow motion token (read from the stylesheet).
  const drawMs = useMemo(() => motionDuration("slow"), []);
  const t = thresholds;
  const data = withClusterLabels(points);

  return (
    <ChartContainer config={config} className="aspect-auto h-[22rem] w-full">
      <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 4 }}>
        <ReferenceArea x1={0} x2={t.minConfidence} y1={0} y2={100} fill="var(--muted-foreground)" fillOpacity={0.06} />
        <ReferenceArea x1={t.prioritizeConfidence} x2={100} y1={t.prioritizeScore} y2={100} fill="var(--foreground)" fillOpacity={0.05} />
        <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" />
        <ReferenceLine x={t.minConfidence} stroke="var(--line)" />
        <ReferenceLine y={t.testScore} stroke="var(--line)" />
        <XAxis
          type="number"
          dataKey="confidence"
          domain={[0, 100]}
          ticks={[0, 20, 40, 60, 80, 100]}
          tickLine={false}
          axisLine={false}
          label={{ value: "Confiance (%)", position: "insideBottom", offset: -16, fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="score"
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickLine={false}
          axisLine={false}
          width={52}
          label={{ value: "Score", angle: -90, position: "insideLeft", offset: 0, fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          cursor={false}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as MapPoint | undefined;
            if (!p) return null;
            return (
              <div className="rounded-md border border-line bg-popover px-3 py-2 text-xs">
                <p className="font-medium">{p.name}</p>
                <p>Score {Math.round(p.score)}/100, confiance {p.confidence} %</p>
                {p.mock && <p className="text-kind-mock">Valeurs fictives (mock)</p>}
              </div>
            );
          }}
        />
        <Scatter
          data={data}
          fill="var(--foreground)"
          className="cursor-pointer"
          isAnimationActive={!reducedMotion}
          animationDuration={drawMs}
          onClick={(entry) => {
            const code = (entry as unknown as { payload?: MapPoint }).payload?.code;
            if (code) router.push(`/analyses/${analysisId}/${code.toLowerCase()}`);
          }}
        >
          <LabelList
            dataKey="label"
            content={({ x, y, index }) => {
              const point = index === undefined ? undefined : data[index];
              if (!point?.label) return null;
              // Single line, never wrapped (Recharts' default label splits on spaces).
              return (
                <text
                  x={Number(x) + (point.labelBelow ? 10 : 5)}
                  y={Number(y) + (point.labelBelow ? 26 : -8)}
                  textAnchor={point.labelBelow ? "end" : "middle"}
                  fill="var(--foreground)"
                  fontSize={12}
                  fontWeight={600}
                >
                  {point.label}
                </text>
              );
            }}
          />
        </Scatter>
        <text x="96%" y={22} textAnchor="end" fill="var(--foreground)" fontSize={11} fontWeight={600}>
          Prioriser
        </text>
        <text x={56} y={22} fill="var(--muted-foreground)" fontSize={11}>
          Exploratoire
        </text>
      </ScatterChart>
    </ChartContainer>
  );
}
