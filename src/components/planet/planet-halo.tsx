"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CountryCode } from "@/domain/country";
import type { VerdictValue } from "@/engine/report/verdict";
import { AsciiPlanet, type AsciiPlanetProps } from "./ascii-planet";
import "@/components/marketing/marketing.css";

interface PlanetHaloProps extends Omit<AsciiPlanetProps, "className" | "onFace"> {
  readonly onFace?: (country: CountryCode) => void;
  /** Once an analysis has answered: the halo takes the verdict's colour. */
  readonly verdict?: VerdictValue;
  /** The white halo around the planet, the local AI's mark. Off without the AI. */
  readonly halo?: boolean;
  /** Follows the pointer a little, for the planet in the background. */
  readonly tilt?: boolean;
  readonly className?: string;
  /** Shown over the planet, centred (a verdict word, for instance). */
  readonly children?: ReactNode;
}

/** The ASCII planet inside the ring of white light the AI's aura uses: one signature for the whole app. */
export function PlanetHalo({ tilt = false, halo = true, verdict, className, children, onFace, ...planet }: PlanetHaloProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!tilt || !node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.style.setProperty("--tilt-x", `${(event.clientX / window.innerWidth - 0.5) * 18}px`);
        node.style.setProperty("--tilt-y", `${(event.clientY / window.innerHeight - 0.5) * 18}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [tilt]);

  return (
    <div ref={ref} aria-hidden={children ? undefined : true} data-verdict={verdict} data-halo={halo ? undefined : "off"} className={cn("eclipse", className)}>
      <span aria-hidden className="eclipse-glow" />
      <span aria-hidden className="eclipse-corona" />
      <span aria-hidden className="eclipse-verdict" />
      <span className="eclipse-disc">
        <span aria-hidden className="absolute inset-[1.5%]">
          <AsciiPlanet {...planet} onFace={onFace} />
        </span>
        {children && <span className="relative">{children}</span>}
      </span>
    </div>
  );
}
