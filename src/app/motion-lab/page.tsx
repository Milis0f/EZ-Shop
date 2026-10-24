import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MotionLab } from "./motion-lab";

export const metadata: Metadata = {
  title: "Laboratoire d'animation",
  robots: { index: false, follow: false },
};

/** Development only: every motion primitive, with demo controls. Absent from production builds. */
export default function MotionLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Laboratoire d&apos;animation (développement)</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Chaque primitive du kit de mouvement, avec des contrôles de démonstration. Aucune donnée réelle ici : les valeurs sont
          fictives et servent seulement à voir le mouvement. Cette page n&apos;existe pas en production.
        </p>
      </header>
      <MotionLab />
    </div>
  );
}
