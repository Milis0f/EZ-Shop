import { cn } from "@/lib/utils";

type VerdictTone = "oui" | "non" | "surveiller";

const VERDICT_WORDS: Readonly<Record<VerdictTone, string>> = { oui: "OUI", non: "NON", surveiller: "À SURVEILLER" };

const VERDICT_TONE: Readonly<Record<VerdictTone, string>> = {
  oui: "border-verdict-oui/35 text-verdict-oui",
  non: "border-verdict-non/35 text-verdict-non",
  surveiller: "border-verdict-surveiller/35 text-verdict-surveiller",
};

interface Thresholds {
  readonly prioritizeScore: number;
  readonly prioritizeConfidence: number;
  readonly testScore: number;
  readonly minConfidence: number;
}

interface Row {
  readonly condition: string;
  readonly verdict: VerdictTone;
  readonly reason: string;
}

/**
 * The rows of `verdict_v1` (src/engine/report/verdict.ts) in the order the rule checks them: blocking
 * factors first, then `decide()` in src/engine/scoring/confidence.ts.
 */
function rows(t: Thresholds): Row[] {
  return [
    { condition: "Un facteur bloquant est connu", verdict: "non", reason: "Le facteur bloquant" },
    { condition: "Données insuffisantes : aucun score", verdict: "surveiller", reason: "Les sources à connecter" },
    {
      condition: `Exploratoire seulement : confiance sous ${t.minConfidence} %`,
      verdict: "surveiller",
      reason: "Confiance trop faible, avec le facteur le plus faible",
    },
    {
      condition: `Prioriser : score d'au moins ${t.prioritizeScore}, confiance d'au moins ${t.prioritizeConfidence} %`,
      verdict: "oui",
      reason: "Les signaux les plus forts",
    },
    { condition: `Éviter : score sous ${t.testScore}`, verdict: "non", reason: "Les critères les plus faibles" },
    {
      condition: `Tester prudemment : score d'au moins ${t.testScore}, confiance d'au moins ${t.minConfidence} %, sans atteindre Prioriser`,
      verdict: "surveiller",
      reason: "Signaux mitigés, avec le point fort et le point faible",
    },
  ];
}

export function VerdictWord({ verdict, className }: { readonly verdict: VerdictTone; readonly className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-pill border px-3.5 font-display text-[12px] font-medium whitespace-nowrap",
        VERDICT_TONE[verdict],
        className,
      )}
    >
      {VERDICT_WORDS[verdict]}
    </span>
  );
}

/**
 * The verdict rule as a table, built from the same thresholds as the engine. Below 640 px each row
 * becomes a tile: condition, then verdict and reason.
 */
export function VerdictTable({ t }: { readonly t: Thresholds }) {
  return (
    <table className="w-full border-separate border-spacing-0 text-left text-sm max-sm:block">
      <caption className="sr-only">Règle de verdict verdict_v1, dans l&apos;ordre où elle est appliquée</caption>
      <thead className="max-sm:sr-only">
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="px-5 pb-3 font-normal">
            Situation
          </th>
          <th scope="col" className="px-5 pb-3 font-normal">
            Verdict
          </th>
          <th scope="col" className="px-5 pb-3 font-normal">
            Raison affichée
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
        {rows(t).map((r) => (
          <tr key={r.condition} className="group max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:rounded-tile max-sm:bg-surface-2 max-sm:p-4">
            <td className="border-t border-line px-5 py-3.5 align-middle text-foreground group-first:border-t-0 max-sm:border-0 max-sm:p-0">{r.condition}</td>
            <td className="border-t border-line px-5 py-3.5 align-middle group-first:border-t-0 max-sm:border-0 max-sm:p-0">
              <VerdictWord verdict={r.verdict} />
            </td>
            <td className="border-t border-line px-5 py-3.5 align-middle text-muted-foreground group-first:border-t-0 max-sm:border-0 max-sm:p-0">{r.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
