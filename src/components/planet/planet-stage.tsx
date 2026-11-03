"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useAiInstall } from "@/components/ai/ai-install-store";
import { VERDICT_COLOR } from "@/components/analysis/verdict-colors";
import { verdictWord } from "@/engine/report/localize";
import { countryName } from "@/components/search/display-names";
import type { CountryCode } from "@/domain/country";
import { useLocale, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import type { PlanetMode } from "./ascii-planet";
import { PlanetHalo } from "./planet-halo";
import { shownProgress, shownStep, usePlanetState, type PlanetAnalysis } from "./planet-store";

/** Where the planet stands on each kind of page; the places themselves are in marketing.css. */
export type PlanetPose = "hub" | "home" | "report" | "country" | "competitor" | "store" | "sources" | "method" | "other" | "analysing" | "anchored";

interface Look {
  readonly mode: PlanetMode;
  readonly facing?: readonly [number, number];
}

/** What each page turns the planet to: Asia for suppliers, Europe for the method, the world elsewhere. */
const LOOK: Readonly<Record<Exclude<PlanetPose, "analysing" | "report" | "country" | "store" | "anchored">, Look>> = {
  hub: { mode: "drift" },
  home: { mode: "drift" },
  competitor: { mode: "focus", facing: [105, 28] },
  sources: { mode: "drift" },
  method: { mode: "focus", facing: [10, 48] },
  other: { mode: "drift" },
};

export function poseFor(pathname: string): Exclude<PlanetPose, "analysing" | "anchored"> {
  if (pathname === "/") return "hub";
  if (pathname.startsWith("/analyse/") || pathname === "/analyse") return "home";
  if (/^\/analyses\/[^/]+\/[a-z]{2}\/?$/i.test(pathname)) return "country";
  if (pathname.startsWith("/analyses/")) return "report";
  if (pathname.startsWith("/competitor")) return "competitor";
  if (pathname.startsWith("/store")) return "store";
  if (pathname.startsWith("/connectors")) return "sources";
  if (pathname.startsWith("/methodology")) return "method";
  return "other";
}

const noop = () => () => undefined;

function useSeconds(since: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}

/** The ring's progress, read again a few times a second while an analysis runs. */
function useProgress(analysis: PlanetAnalysis | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!analysis) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [analysis]);
  return analysis ? shownProgress(analysis, now) : 0;
}

/** Under the planet while an analysis runs: the product, the time spent, the countries asked for. */
function AnalysisCaption({ analysis, faced }: { readonly analysis: PlanetAnalysis; readonly faced: CountryCode | null }) {
  const locale = useLocale();
  const m = useMessages("shell").planet;
  const seconds = useSeconds(analysis.startedAt);
  return (
    <div className="planet-caption font-mono text-sm tracking-[-0.02em]">
      <p className="text-foreground">
        <span aria-hidden className="text-muted-foreground">
          ❯{" "}
        </span>
        {m.running} {analysis.product ? `"${analysis.product}"` : ""}
        <span aria-hidden className="planet-cursor" />
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {t(m.elapsed, { seconds: String(seconds) })}
        {faced ? ` · → ${countryName(faced, locale)}` : ""}
      </p>
      {analysis.countries.length > 1 && (
        <ul aria-label={t(m.targets, { count: String(analysis.countries.length) })} className="mt-3 flex max-w-xl flex-wrap justify-center gap-1.5">
          {analysis.countries.map((code) => (
            <li key={code} title={countryName(code, locale)} data-faced={code === faced || undefined} className="planet-tag">
              {code}
            </li>
          ))}
        </ul>
      )}
      <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">{analysis.message}</p>
    </div>
  );
}

/** In the middle of the planet while it works: what is being done, and how far along. */
function ProgressCore({ step, progress }: { readonly step: string | null; readonly progress: number }) {
  return (
    <span className="planet-core">
      <span className="planet-core-percent tabular">{Math.round(progress * 100)} %</span>
      {step && (
        <span key={step} className="planet-core-step font-mono">
          {step}
        </span>
      )}
    </span>
  );
}

/**
 * The one planet of the app, behind every page. It stays on the right: each page only nudges and zooms
 * it, and turns it to what the page is about. During an analysis it zooms in where it is while the page
 * fades, marks the countries asked for, and settles back when the report is there.
 */
export function PlanetStage() {
  const pathname = usePathname() ?? "/";
  const { analysis, scene, anchor } = usePlanetState();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [faced, setFaced] = useState<CountryCode | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState(0);
  const locale = useLocale();
  const orb = useMessages("report").orb;
  // The white halo is the local AI's mark: without the AI, the planet has none.
  const aiStatus = useAiInstall();
  const base = poseFor(pathname);
  const anchored = !analysis && base === "report" && anchor !== null && stageSize > 0;
  const pose: PlanetPose = analysis ? "analysing" : anchored ? "anchored" : base;

  // The stage's own size, to scale it onto the report's anchor.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setStageSize(node.offsetWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Resting on a report, the planet scrolls with the page: its layer stays fixed and follows the scroll.
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    if (!anchored) {
      node.style.transform = "";
      return;
    }
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.transform = `translate3d(0, ${-window.scrollY}px, 0)`;
      });
    };
    follow();
    window.addEventListener("scroll", follow, { passive: true });
    return () => {
      window.removeEventListener("scroll", follow);
      cancelAnimationFrame(frame);
    };
  }, [anchored]);
  const progress = useProgress(analysis);
  const step = analysis ? shownStep(analysis, progress) : null;
  const planetMessages = useMessages("shell").planet;
  const anchorStyle: CSSProperties | undefined =
    anchored && anchor
      ? ({ "--px": `${anchor.x}px`, "--py": `${anchor.y}px`, "--ps": anchor.size / stageSize } as CSSProperties)
      : analysis
        ? ({ "--progress": progress } as CSSProperties)
        : undefined;
  const verdict = !analysis && (base === "report" || base === "country") ? scene?.verdict : undefined;

  // The page steps back while the planet works; nothing of it can be clicked meanwhile.
  useEffect(() => {
    const root = document.documentElement;
    if (analysis) root.dataset.analysing = "";
    else delete root.dataset.analysing;
    return () => {
      delete root.dataset.analysing;
    };
  }, [analysis]);

  let look: Look & { highlight?: readonly CountryCode[]; focus?: readonly CountryCode[]; markers?: readonly CountryCode[] };
  if (analysis) {
    look = { mode: analysis.countries.length > 1 ? "scan" : "focus", focus: analysis.countries, highlight: analysis.countries, markers: analysis.countries };
  } else if ((base === "report" || base === "country" || base === "store") && scene) {
    // On the store page, the planet visits the countries the store sells to, each one marked.
    look = { mode: base === "store" && scene.countries.length > 1 ? "scan" : "focus", focus: base === "store" ? scene.countries : [scene.focus], highlight: scene.countries, markers: base === "country" ? [scene.focus] : scene.countries };
  } else {
    look = LOOK[base === "report" || base === "country" || base === "store" ? "other" : base];
  }

  return (
    <div aria-hidden={analysis ? undefined : true} className="planet-layer">
      <div ref={scrollerRef} className="planet-scroller">
      <div ref={stageRef} data-pose={pose} style={anchorStyle} className={cn("planet-stage", !mounted && "planet-stage-static")}>
        <PlanetHalo
          mode={look.mode}
          facing={look.facing ?? null}
          focus={look.focus}
          highlight={look.highlight}
          markers={look.markers}
          fontSize={anchored ? 15 : 10}
          tilt={pose === "home" || pose === "hub"}
          halo={aiStatus === null || aiStatus.state === "installed"}
          verdict={verdict}
          onFace={setFaced}
          className="planet-halo"
        >
          {analysis && <ProgressCore step={step} progress={progress} />}
          {anchored && scene?.verdict && (
            <span className="planet-verdict">
              <span className="planet-verdict-word font-display" style={{ color: VERDICT_COLOR[scene.verdict] }}>
                {verdictWord(scene.verdict, locale)}
              </span>
              {scene.confidence !== undefined && (
                <span className="planet-verdict-confidence tabular">{t(orb.confidence, { confidence: `${Math.round(scene.confidence)} %` })}</span>
              )}
            </span>
          )}
        </PlanetHalo>
        {analysis && (
          <span role="progressbar" aria-label={planetMessages.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={step ?? undefined} className="sr-only" />
        )}
        <svg aria-hidden viewBox="-100 -100 200 200" className="planet-orbit">
          <ellipse rx="96" ry="30" className="planet-orbit-path" />
          <circle r="2.4" className="planet-orbit-moon">
            <animateMotion dur="9s" repeatCount="indefinite" path="M -96 0 A 96 30 0 1 0 96 0 A 96 30 0 1 0 -96 0" />
          </circle>
        </svg>
      </div>
      </div>
      {analysis && (
        <p role="status" aria-live="polite" className="sr-only">
          {step}
        </p>
      )}
      {analysis && <AnalysisCaption analysis={analysis} faced={faced} />}
    </div>
  );
}
