"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Disclosure } from "@/components/motion/disclosure";
import { DrawPath } from "@/components/motion/draw-path";
import { Expand } from "@/components/motion/expand";
import { PendingButton } from "@/components/motion/pending-button";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Reveal, RevealGroup } from "@/components/motion/reveal";
import { RingLoader } from "@/components/motion/ring-loader";
import { SegmentedControl } from "@/components/motion/segmented-control";
import { viewTransition } from "@/components/motion/view-transition";
import { Button } from "@/components/ui/button";
import { useFormat, useMessages } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";

type LabMessages = Messages<"methodology">["motionLab"];

/** How long the pending demos stay busy. */
const DEMO_WAIT_MS = 2400;

/** A decorative wave for the drawn-path demo: geometry only, no data behind it. */
const WAVE_PATH = Array.from({ length: 71 }, (_, i) => {
  const x = i * 8;
  const y = 80 - 34 * Math.sin(x / 52) * (0.62 + 0.38 * Math.cos(x / 150));
  return `${i === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
}).join(" ");

const RING_VALUES = ["24", "64", "92"] as const;
type RingValue = (typeof RING_VALUES)[number];

const SWATCHES = [
  { key: "mint", color: "var(--verdict-oui)", value: 80 },
  { key: "amber", color: "var(--verdict-surveiller)", value: 55 },
  { key: "coral", color: "var(--verdict-non)", value: 30 },
] as const;

const SIGNALS = ["first", "second", "third", "fourth"] as const;

const TILES = ["one", "two", "three"] as const;

/** The motion lab strings in the active locale. */
const useLab = (): LabMessages => useMessages("methodology").motionLab;

interface LabPanelProps {
  readonly title: string;
  readonly hint: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

function LabPanel({ title, hint, children, className }: LabPanelProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("panel p-6 sm:p-8", className)}>
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[56ch] text-sm leading-relaxed text-muted-foreground">{hint}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Replay({ onClick }: { readonly onClick: () => void }) {
  const m = useLab();
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      {m.replay}
    </Button>
  );
}

function RingDemo() {
  const m = useLab().ring;
  const f = useFormat();
  const [value, setValue] = useState<RingValue>("64");
  const [run, setRun] = useState(0);
  const options = RING_VALUES.map((v) => ({ value: v, label: f.pct(Number(v)) }));
  return (
    <LabPanel
      title={m.title}
      hint={m.hint}
      className="min-[900px]:col-span-2"
    >
      <div className="grid items-center gap-10 min-[900px]:grid-cols-[auto_1fr]">
        <div key={run} className="grid place-items-center">
          <ProgressRing
            value={Number(value)}
            size={232}
            thickness={10}
            color="var(--verdict-oui)"
            glow
            delay={120}
            aria-label={t(m.aria, { value: f.pct(Number(value)) })}
          >
            <span className="font-display text-xl font-bold tracking-tight text-verdict-oui">{m.demo}</span>
            <span className="mt-1.5 text-sm text-muted-foreground tabular-nums">{t(m.value, { value: f.pct(Number(value)) })}</span>
          </ProgressRing>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl options={options} value={value} onChange={setValue} aria-label={m.selectorAria} />
            <Replay onClick={() => setRun((n) => n + 1)} />
          </div>
          <ul className="flex flex-wrap gap-6" key={run}>
            {SWATCHES.map((swatch, index) => (
              <li key={swatch.key} className="flex items-center gap-3">
                <ProgressRing
                  value={swatch.value}
                  size={64}
                  thickness={6}
                  color={swatch.color}
                  delay={240 + index * 60}
                  aria-label={t(m.swatchAria, { name: m.swatches[swatch.key], value: f.pct(swatch.value) })}
                />
                <span className="text-sm text-muted-foreground">{m.swatches[swatch.key]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </LabPanel>
  );
}

async function demoAction(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, DEMO_WAIT_MS));
}

function PendingDemo() {
  const m = useLab().pending;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), DEMO_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <LabPanel
      title={m.title}
      hint={m.hint}
    >
      <div className="flex flex-wrap items-center gap-4">
        <PendingButton type="button" pending={pending} pendingLabel={m.analysing} onClick={() => setPending(true)}>
          {m.analyse}
        </PendingButton>
        <form action={demoAction}>
          <PendingButton pendingLabel={m.validating}>{m.validate}</PendingButton>
        </form>
      </div>
    </LabPanel>
  );
}

function SegmentedDemo() {
  const m = useLab().segmented;
  const [zone, setZone] = useState<"france" | "monde">("france");
  const [period, setPeriod] = useState<"jour" | "semaine" | "mois">("semaine");
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <div className="flex flex-col items-start gap-4">
        <SegmentedControl
          options={[
            { value: "france", label: m.france },
            { value: "monde", label: m.world },
          ]}
          value={zone}
          onChange={setZone}
          aria-label={m.zoneAria}
        />
        <SegmentedControl
          options={[
            { value: "jour", label: m.day },
            { value: "semaine", label: m.week },
            { value: "mois", label: m.month },
          ]}
          value={period}
          onChange={setPeriod}
          aria-label={m.periodAria}
        />
      </div>
    </LabPanel>
  );
}

function RevealDemo() {
  const m = useLab().reveal;
  const [run, setRun] = useState(0);
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <RevealGroup key={run} as="ul" trigger="visible" className="flex flex-wrap gap-2.5">
        {SIGNALS.map((signal, index) => (
          <Reveal key={signal} as="li" index={index} className="rounded-pill border border-line bg-surface-2 px-4 py-2 text-sm">
            {m.signals[signal]}
          </Reveal>
        ))}
      </RevealGroup>
      <div className="mt-6">
        <Replay onClick={() => setRun((n) => n + 1)} />
      </div>
    </LabPanel>
  );
}

function DrawDemo() {
  const m = useLab().draw;
  const [run, setRun] = useState(0);
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <svg key={run} viewBox="0 0 560 160" className="h-auto w-full" role="img" aria-label={m.aria}>
        <line x1="0" y1="80" x2="560" y2="80" stroke="var(--trait)" strokeDasharray="4 6" />
        <DrawPath d={WAVE_PATH} fill="none" stroke="var(--craie)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-6">
        <Replay onClick={() => setRun((n) => n + 1)} />
      </div>
    </LabPanel>
  );
}

function NumberDemo() {
  const m = useLab().number;
  const [run, setRun] = useState(0);
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <dl key={run} className="grid grid-cols-2 gap-6">
        <div>
          <dt className="text-sm text-muted-foreground">{m.number}</dt>
          <dd className="mt-2 text-4xl font-semibold tracking-tight">
            <AnimatedNumber value={1234} format="int" />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{m.percent}</dt>
          <dd className="mt-2 text-4xl font-semibold tracking-tight">
            <AnimatedNumber value={56.7} format="percent" />
          </dd>
        </div>
      </dl>
      <div className="mt-6">
        <Replay onClick={() => setRun((n) => n + 1)} />
      </div>
    </LabPanel>
  );
}

function ExpandDemo() {
  const m = useLab().expand;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <Button type="button" variant="secondary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        {open ? m.hide : m.show}
      </Button>
      <Expand open={open} id={panelId}>
        <div className="mt-4 rounded-tile bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">
          {m.content}
        </div>
      </Expand>
      <div className="mt-6 border-t border-line pt-4">
        <Disclosure summary={<span className="text-sm font-medium">{m.disclosure}</span>} summaryClassName="px-3 py-2">
          <p className="px-3 pt-2 pb-3 text-sm text-muted-foreground">{m.disclosureBody}</p>
        </Disclosure>
      </div>
    </LabPanel>
  );
}

function ViewTransitionDemo() {
  const m = useLab().viewTransition;
  const [layout, setLayout] = useState<"compact" | "detail">("compact");
  const change = (next: "compact" | "detail") => {
    void viewTransition(() => flushSync(() => setLayout(next)));
  };
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <SegmentedControl
        options={[
          { value: "compact", label: m.compact },
          { value: "detail", label: m.detail },
        ]}
        value={layout}
        onChange={change}
        aria-label={m.aria}
      />
      <div
        className={cn("mt-6 rounded-tile bg-surface-2", layout === "compact" ? "w-56 p-4" : "w-full p-6")}
        style={{ viewTransitionName: "motion-lab-card" }}
      >
        <p className="text-sm font-medium">{m.card}</p>
        {layout === "detail" ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {m.cardDetail}
          </p>
        ) : null}
      </div>
    </LabPanel>
  );
}

function LoaderDemo() {
  const m = useLab().loader;
  return (
    <LabPanel title={m.title} hint={m.hint}>
      <div className="flex items-center gap-8">
        <RingLoader size="sm" />
        <RingLoader size="md" />
        <span className="text-muted-foreground">
          <RingLoader size="md" label={m.label} />
        </span>
      </div>
    </LabPanel>
  );
}

function ScrollRevealDemo() {
  const m = useLab().scrollReveal;
  return (
    <LabPanel
      title={m.title}
      hint={m.hint}
      className="min-[900px]:col-span-2"
    >
      <RevealGroup className="grid gap-3 min-[900px]:grid-cols-3">
        {TILES.map((tile, index) => (
          <Reveal key={tile} index={index} className="rounded-tile bg-surface-2 px-5 py-6 text-sm">
            {m.tiles[tile]}
          </Reveal>
        ))}
      </RevealGroup>
    </LabPanel>
  );
}

export function MotionLab() {
  return (
    <div className="mt-12 grid gap-4 min-[900px]:grid-cols-2">
      <RingDemo />
      <PendingDemo />
      <SegmentedDemo />
      <RevealDemo />
      <DrawDemo />
      <NumberDemo />
      <ExpandDemo />
      <ViewTransitionDemo />
      <LoaderDemo />
      <ScrollRevealDemo />
    </div>
  );
}
