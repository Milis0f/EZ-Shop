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
import { cn } from "@/lib/utils";

/** How long the pending demos stay busy. */
const DEMO_WAIT_MS = 2400;

/** A decorative wave for the drawn-path demo: geometry only, no data behind it. */
const WAVE_PATH = Array.from({ length: 71 }, (_, i) => {
  const x = i * 8;
  const y = 80 - 34 * Math.sin(x / 52) * (0.62 + 0.38 * Math.cos(x / 150));
  return `${i === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`;
}).join(" ");

const RING_VALUES = [
  { value: "24", label: "24 %" },
  { value: "64", label: "64 %" },
  { value: "92", label: "92 %" },
] as const;
type RingValue = (typeof RING_VALUES)[number]["value"];

const SWATCHES = [
  { name: "Menthe", color: "var(--verdict-oui)", value: 80 },
  { name: "Ambre", color: "var(--verdict-surveiller)", value: 55 },
  { name: "Corail", color: "var(--verdict-non)", value: 30 },
] as const;

const SIGNALS = ["Premier signal fictif", "Deuxième signal fictif", "Troisième signal fictif", "Quatrième signal fictif"];

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

const Replay = ({ onClick }: { readonly onClick: () => void }) => (
  <Button type="button" variant="secondary" size="sm" onClick={onClick}>
    Rejouer
  </Button>
);

function RingDemo() {
  const [value, setValue] = useState<RingValue>("64");
  const [run, setRun] = useState(0);
  return (
    <LabPanel
      title="Jauge circulaire"
      hint="L'arc se trace une fois de zéro à la valeur, quand la jauge apparaît. Un halo flou de la même couleur, sans ombre. Ensuite, un changement de valeur glisse jusqu'à la nouvelle."
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
            aria-label={`Jauge de démonstration, valeur fictive ${value} %`}
          >
            <span className="font-display text-xl font-bold tracking-tight text-verdict-oui">Démo</span>
            <span className="mt-1.5 text-sm text-muted-foreground tabular-nums">Valeur fictive {value} %</span>
          </ProgressRing>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl options={RING_VALUES} value={value} onChange={setValue} aria-label="Valeur fictive de la jauge" />
            <Replay onClick={() => setRun((n) => n + 1)} />
          </div>
          <ul className="flex flex-wrap gap-6" key={run}>
            {SWATCHES.map((swatch, index) => (
              <li key={swatch.name} className="flex items-center gap-3">
                <ProgressRing
                  value={swatch.value}
                  size={64}
                  thickness={6}
                  color={swatch.color}
                  delay={240 + index * 60}
                  aria-label={`Couleur ${swatch.name}, valeur fictive ${swatch.value} %`}
                />
                <span className="text-sm text-muted-foreground">{swatch.name}</span>
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
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), DEMO_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  return (
    <LabPanel
      title="Bouton avec attente"
      hint="Le libellé laisse la place à l'anneau sans changer la largeur du bouton. Le second suit son formulaire local (useFormStatus) : rien ne quitte la page."
    >
      <div className="flex flex-wrap items-center gap-4">
        <PendingButton type="button" pending={pending} pendingLabel="Analyse en cours" onClick={() => setPending(true)}>
          Analyser
        </PendingButton>
        <form action={demoAction}>
          <PendingButton pendingLabel="Validation en cours">Valider la démo</PendingButton>
        </form>
      </div>
    </LabPanel>
  );
}

function SegmentedDemo() {
  const [zone, setZone] = useState<"france" | "monde">("france");
  const [period, setPeriod] = useState<"jour" | "semaine" | "mois">("semaine");
  return (
    <LabPanel title="Sélecteur segmenté" hint="Le curseur glisse avec un ressort. Au clavier : flèches, Début et Fin.">
      <div className="flex flex-col items-start gap-4">
        <SegmentedControl
          options={[
            { value: "france", label: "France" },
            { value: "monde", label: "Monde entier" },
          ]}
          value={zone}
          onChange={setZone}
          aria-label="Zone de démonstration"
        />
        <SegmentedControl
          options={[
            { value: "jour", label: "Jour" },
            { value: "semaine", label: "Semaine" },
            { value: "mois", label: "Mois" },
          ]}
          value={period}
          onChange={setPeriod}
          aria-label="Période de démonstration"
        />
      </div>
    </LabPanel>
  );
}

function RevealDemo() {
  const [run, setRun] = useState(0);
  return (
    <LabPanel title="Apparition échelonnée" hint="Les éléments montent et apparaissent une seule fois, l'un après l'autre (60 ms d'écart).">
      <RevealGroup key={run} as="ul" trigger="visible" className="flex flex-wrap gap-2.5">
        {SIGNALS.map((signal, index) => (
          <Reveal key={signal} as="li" index={index} className="rounded-pill border border-line bg-surface-2 px-4 py-2 text-sm">
            {signal}
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
  const [run, setRun] = useState(0);
  return (
    <LabPanel title="Tracé de courbe" hint="Une ligne pleine se dessine une fois quand elle devient visible. Courbe décorative, sans données.">
      <svg key={run} viewBox="0 0 560 160" className="h-auto w-full" role="img" aria-label="Courbe décorative de démonstration">
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
  const [run, setRun] = useState(0);
  return (
    <LabPanel title="Nombre animé" hint="Compte une fois jusqu'à sa valeur quand il apparaît, en chiffres tabulaires. Nombres fictifs.">
      <dl key={run} className="grid grid-cols-2 gap-6">
        <div>
          <dt className="text-sm text-muted-foreground">Nombre fictif</dt>
          <dd className="mt-2 text-4xl font-semibold tracking-tight">
            <AnimatedNumber value={1234} format="int" />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Pourcentage fictif</dt>
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <LabPanel title="Panneau extensible" hint="La hauteur suit le contenu, sans mesure. Le contenu fermé reste dans la page mais n'est plus atteignable.">
      <Button type="button" variant="secondary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        {open ? "Masquer le détail" : "Afficher le détail"}
      </Button>
      <Expand open={open} id={panelId}>
        <div className="mt-4 rounded-tile bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">
          Contenu de démonstration. Il s&apos;ouvre en hauteur et en fondu, et se referme de la même manière.
        </div>
      </Expand>
      <div className="mt-6 border-t border-line pt-4">
        <Disclosure summary={<span className="text-sm font-medium">Disclosure, même mouvement</span>} summaryClassName="px-3 py-2">
          <p className="px-3 pt-2 pb-3 text-sm text-muted-foreground">Le composant Disclosure utilise maintenant Expand.</p>
        </Disclosure>
      </div>
    </LabPanel>
  );
}

function ViewTransitionDemo() {
  const [layout, setLayout] = useState<"compact" | "detail">("compact");
  const change = (next: "compact" | "detail") => {
    void viewTransition(() => flushSync(() => setLayout(next)));
  };
  return (
    <LabPanel title="Transition de vue" hint="Un changement de mode passe par une View Transition quand le navigateur le permet, sinon il est immédiat.">
      <SegmentedControl
        options={[
          { value: "compact", label: "Compact" },
          { value: "detail", label: "Détaillé" },
        ]}
        value={layout}
        onChange={change}
        aria-label="Affichage de démonstration"
      />
      <div
        className={cn("mt-6 rounded-tile bg-surface-2", layout === "compact" ? "w-56 p-4" : "w-full p-6")}
        style={{ viewTransitionName: "motion-lab-card" }}
      >
        <p className="text-sm font-medium">Carte de démonstration</p>
        {layout === "detail" ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            En mode détaillé, la carte prend toute la largeur et montre ce texte en plus.
          </p>
        ) : null}
      </div>
    </LabPanel>
  );
}

function LoaderDemo() {
  return (
    <LabPanel title="Anneau de chargement" hint="Hérite de la couleur du texte. Immobile si le mouvement réduit est demandé.">
      <div className="flex items-center gap-8">
        <RingLoader size="sm" />
        <RingLoader size="md" />
        <span className="text-muted-foreground">
          <RingLoader size="md" label="Chargement de démonstration" />
        </span>
      </div>
    </LabPanel>
  );
}

function ScrollRevealDemo() {
  return (
    <LabPanel
      title="Apparition au défilement"
      hint="Joue une fois quand la section entre à l'écran ; déjà visible au chargement, elle joue tout de suite."
      className="min-[900px]:col-span-2"
    >
      <RevealGroup className="grid gap-3 min-[900px]:grid-cols-3">
        {["Tuile une", "Tuile deux", "Tuile trois"].map((tile, index) => (
          <Reveal key={tile} index={index} className="rounded-tile bg-surface-2 px-5 py-6 text-sm">
            {tile}
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
