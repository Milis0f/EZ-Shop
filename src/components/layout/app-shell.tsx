import { Suspense, type ReactNode } from "react";
import { OrbitDock } from "@/components/orbit/orbit-dock";
import { PlanetStage } from "@/components/planet/planet-stage";
import { cn } from "@/lib/utils";

/**
 * No bar and no rail: the planet is the interface. On the home page its five places sit around it; on
 * every other page they fold into a ring of light at the top left (OrbitDock). Both read the URL, so they
 * render inside <Suspense> (Cache Components).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={null}>
        <PlanetStage />
      </Suspense>
      <Suspense fallback={null}>
        <OrbitDock />
      </Suspense>
      <main
        id="contenu"
        className={cn(
          // The planet's lights reach past the column: clipped here, without breaking anything sticky.
          "planet-steps-back relative z-[1] min-w-0 overflow-x-clip px-4 pt-20 pb-20 sm:px-12 2xl:px-20",
        )}
      >
        {children}
      </main>
    </div>
  );
}
