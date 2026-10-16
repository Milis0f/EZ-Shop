import { FlaskConical } from "lucide-react";

/** Unmissable notice: every number on the page is synthetic. */
export function MockBanner() {
  return (
    <div role="status" className="hatch-mock mb-12 rounded-md border border-kind-mock/60 bg-background/80">
      <div className="flex items-start gap-3 bg-background/85 px-4 py-3 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-kind-mock" aria-hidden />
        <p>
          <span className="font-semibold text-kind-mock">Données fictives de développement.</span>{" "}
          Chaque valeur de cette analyse est générée localement pour tester l&apos;interface. Elle ne décrit aucun marché réel et ne
          doit servir à aucune décision.
        </p>
      </div>
    </div>
  );
}
