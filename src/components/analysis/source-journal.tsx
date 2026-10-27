import Link from "next/link";
import { Disclosure } from "@/components/motion/disclosure";
import type { CountryAnalysis } from "@/domain/analysis";
import type { CountryCode } from "@/domain/country";
import { PROVIDER_IDS, type ProviderId } from "@/domain/provenance";
import type { JournalRow, JournalStatus } from "@/engine/report/source-journal";
import { LICENCE_PENDING } from "@/engine/scoring/criteria";
import { SOURCE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const PROVIDERS: ReadonlySet<string> = new Set(PROVIDER_IDS);
const CONNECTORS_HREF = "/connectors";

export interface MissingSource {
  readonly providerId: ProviderId;
  readonly name: string;
  /** Score points (out of 100) of the criteria this source would feed: the weights of config/scoring.ts. */
  readonly weight: number;
  /** Labels of those criteria. */
  readonly criteria: readonly string[];
  /** Journal state for the country; undefined when the journal has no row (old or mock analysis). */
  readonly status?: JournalStatus;
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

/**
 * Providers whose absence leaves score criteria DATA_INSUFFICIENT, heaviest first. A provider that was
 * used is left out (connecting it again would change nothing), and so are criteria disabled pending a licence check.
 */
export function missingSources(c: CountryAnalysis, journal: readonly JournalRow[]): MissingSource[] {
  const stateOf = (id: ProviderId): JournalStatus | undefined => {
    const rows = journal.filter((r) => r.providerId === id && r.countries.includes(c.country));
    return rows.find((r) => r.status === "used")?.status ?? rows[0]?.status;
  };
  const byProvider = new Map<ProviderId, { weight: number; criteria: string[] }>();
  for (const criterion of c.scoring.criteria) {
    // A statistic disabled until its licence is checked stays empty whatever is connected.
    if (criterion.status !== "DATA_INSUFFICIENT" || criterion.explanation === LICENCE_PENDING) continue;
    for (const key of new Set(criterion.missing)) {
      if (!PROVIDERS.has(key)) continue;
      const id = key as ProviderId;
      const entry = byProvider.get(id) ?? { weight: 0, criteria: [] };
      byProvider.set(id, { weight: entry.weight + criterion.weight, criteria: [...entry.criteria, criterion.label] });
    }
  }
  return [...byProvider.entries()]
    .map(([providerId, { weight, criteria }]): MissingSource => {
      const status = stateOf(providerId);
      return { providerId, name: SOURCE_LABELS[providerId] ?? providerId, weight, criteria, ...(status ? { status } : {}) };
    })
    .filter((s) => s.status !== "used")
    .toSorted((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "fr"));
}

const ACTION: Readonly<Record<JournalStatus, string | null>> = {
  used: null,
  failed: "Réparer",
  not_configured: "Brancher",
  not_implemented: null,
};

/** « Pour obtenir un vrai verdict »: the sources to connect, by the score weight they would cover. */
export function MissingSourcesPanel({ country, journal, className }: { country: CountryAnalysis; journal: readonly JournalRow[]; className?: string }) {
  const sources = missingSources(country, journal).slice(0, 5);
  return (
    <section aria-labelledby="missing-sources-title" className={cn("panel p-6 sm:p-[26px]", className)}>
      <h2 id="missing-sources-title" className="text-[17px] font-semibold">
        Pour obtenir un vrai verdict
      </h2>
      {sources.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Toutes les sources utiles au score ont répondu pour ce pays.</p>
      ) : (
        <>
          <p className="mt-1.5 text-sm text-muted-foreground">Sources qui couvriraient le plus de poids du score.</p>
          <ul className="mt-4 flex flex-col gap-2.5">
            {sources.map((s) => {
              const action = s.status ? ACTION[s.status] : "Brancher";
              return (
                <li key={s.providerId} className="flex items-center justify-between gap-3 rounded-tile bg-surface-2 py-3 pr-3 pl-[18px] text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">
                      <span className="tabular">{s.weight}</span> points du score : {s.criteria.map(lower).join(", ")}
                    </span>
                  </span>
                  {action ? (
                    <Link
                      href={CONNECTORS_HREF}
                      aria-label={`${action} ${s.name} dans Sources de données`}
                      className="shrink-0 rounded-pill bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-primary/85 active:scale-[0.97]"
                    >
                      {action}
                    </Link>
                  ) : (
                    <span className="shrink-0 rounded-pill border border-line px-3.5 py-2 text-[13px] text-muted-foreground">Pas encore disponible</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

const STATUS_LABEL: Readonly<Record<JournalStatus, string>> = {
  used: "Utilisée",
  failed: "En échec",
  not_configured: "Non configurée",
  not_implemented: "Pas encore disponible",
};

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function countriesText(codes: readonly CountryCode[], total: number): string {
  if (total > 1 && codes.length === total) return "tous les pays";
  return codes.length > 6 ? `${codes.length} pays` : codes.join(", ");
}

/** « Journal des sources », collapsed by default: every provider and what it gave, from the stored analysis only. */
export function SourceJournalPanel({ rows, countryCount, className }: { rows: readonly JournalRow[]; countryCount: number; className?: string }) {
  if (rows.length === 0) return null;
  const used = new Set(rows.filter((r) => r.status === "used").map((r) => r.providerId)).size;
  const failed = new Set(rows.filter((r) => r.status === "failed").map((r) => r.providerId)).size;
  return (
    <section aria-label="Journal des sources" className={cn("panel p-2", className)}>
      <Disclosure
        summaryClassName="rounded-[calc(var(--radius-panel)-8px)] px-4 py-4 sm:px-[18px]"
        summary={
          <>
            <span className="block text-[17px] font-semibold">Journal des sources</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">
              {used} source{used > 1 ? "s" : ""} utilisée{used > 1 ? "s" : ""}
              {failed > 0 ? `, ${failed} en échec` : ""}
            </span>
          </>
        }
      >
        <ul className="flex flex-col gap-1.5 px-2 pt-1 pb-2">
          {rows.map((r) => (
            <li
              key={`${r.providerId}|${r.status}|${r.errorCode ?? ""}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-tile bg-surface-2 px-4 py-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", r.status === "used" ? "bg-foreground" : "border border-muted-foreground")}
                />
                <span className="font-medium">{r.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {STATUS_LABEL[r.status]}
                {r.errorCode ? ` (${r.errorCode})` : ""}, {countriesText(r.countries, countryCount)}
                {r.collectedAt ? `, collectée le ${day.format(new Date(r.collectedAt))}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}
