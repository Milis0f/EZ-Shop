import type { Messages } from "@/i18n/messages";
import { t, type TemplateParams } from "@/i18n/translate";
import { cn } from "@/lib/utils";

type VerdictTone = "oui" | "non" | "surveiller";

/** The verdict words of the `common` dictionary, in the active locale. */
type VerdictWords = Messages<"common">["verdict"];

const WORD_KEY: Readonly<Record<VerdictTone, keyof VerdictWords>> = { oui: "yes", non: "no", surveiller: "watch" };

const VERDICT_TONE: Readonly<Record<VerdictTone, string>> = {
  oui: "border-verdict-oui/35 text-verdict-oui",
  non: "border-verdict-non/35 text-verdict-non",
  surveiller: "border-verdict-surveiller/35 text-verdict-surveiller",
};

/** Thresholds already formatted for the active locale (confidences carry their percent sign). */
type Thresholds = TemplateParams & {
  readonly prioritizeScore: number | string;
  readonly prioritizeConfidence: string;
  readonly testScore: number | string;
  readonly minConfidence: string;
};

type VerdictMessages = Messages<"methodology">["verdict"];
type RowKey = keyof VerdictMessages["rows"];

/**
 * The rows of `verdict_v1` (src/engine/report/verdict.ts) in the order the rule checks them: blocking
 * factors first, then `decide()` in src/engine/scoring/confidence.ts.
 */
const ROWS: ReadonlyArray<{ readonly key: RowKey; readonly verdict: VerdictTone }> = [
  { key: "blocking", verdict: "non" },
  { key: "insufficient", verdict: "surveiller" },
  { key: "exploratory", verdict: "surveiller" },
  { key: "prioritize", verdict: "oui" },
  { key: "avoid", verdict: "non" },
  { key: "test", verdict: "surveiller" },
];

interface VerdictWordProps {
  readonly verdict: VerdictTone;
  readonly words: VerdictWords;
  readonly className?: string;
}

export function VerdictWord({ verdict, words, className }: VerdictWordProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-pill border px-3.5 font-display text-[12px] font-medium whitespace-nowrap",
        VERDICT_TONE[verdict],
        className,
      )}
    >
      {words[WORD_KEY[verdict]]}
    </span>
  );
}

interface VerdictTableProps {
  readonly thresholds: Thresholds;
  readonly m: VerdictMessages;
  readonly words: VerdictWords;
}

/**
 * The verdict rule as a table, built from the same thresholds as the engine. Below 640 px each row
 * becomes a tile: condition, then verdict and reason.
 */
export function VerdictTable({ thresholds, m, words }: VerdictTableProps) {
  return (
    <table className="w-full border-separate border-spacing-0 text-left text-sm max-sm:block">
      <caption className="sr-only">{m.tableCaption}</caption>
      <thead className="max-sm:sr-only">
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="px-5 pb-3 font-normal">
            {m.columns.situation}
          </th>
          <th scope="col" className="px-5 pb-3 font-normal">
            {m.columns.verdict}
          </th>
          <th scope="col" className="px-5 pb-3 font-normal">
            {m.columns.reason}
          </th>
        </tr>
      </thead>
      <tbody className="max-sm:flex max-sm:flex-col max-sm:gap-2">
        {ROWS.map((r) => (
          <tr key={r.key} className="group max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:rounded-tile max-sm:bg-surface-2 max-sm:p-4">
            <td className="border-t border-line px-5 py-3.5 align-middle text-foreground group-first:border-t-0 max-sm:border-0 max-sm:p-0">
              {t(m.rows[r.key].condition, thresholds)}
            </td>
            <td className="border-t border-line px-5 py-3.5 align-middle group-first:border-t-0 max-sm:border-0 max-sm:p-0">
              <VerdictWord verdict={r.verdict} words={words} />
            </td>
            <td className="border-t border-line px-5 py-3.5 align-middle text-muted-foreground group-first:border-t-0 max-sm:border-0 max-sm:p-0">
              {m.rows[r.key].reason}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
