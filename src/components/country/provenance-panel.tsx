import { KindMarker } from "@/components/data/kind-marker";
import { Disclosure } from "@/components/motion/disclosure";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionIssue, CountryAnalysis } from "@/domain/analysis";
import { collectSources } from "@/lib/collect-sources";
import { formatDate, SOURCE_LABELS } from "@/lib/format";

const ISSUE_LABELS: Record<string, string> = {
  not_configured: "Non configuré",
  not_implemented: "À implémenter",
  unsupported_country: "Pays non couvert",
  no_data: "Pas de donnée",
  unauthorized: "Accès refusé",
  rate_limited: "Quota atteint",
  timeout: "Délai dépassé",
  upstream_error: "Erreur de la source",
  invalid_response: "Réponse inattendue",
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** Collapsed by default: a one-line count of sources and incidents, the full table on demand. */
export function ProvenancePanel({ c }: { c: CountryAnalysis }) {
  const sources = collectSources(c);
  const issues = dedupeIssues(c.issues);
  return (
    <div className="panel min-w-0 p-2">
      <Disclosure
        summaryClassName="rounded-[calc(var(--radius-panel)-8px)] px-4 py-4 sm:px-[18px]"
        summary={
          <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-medium">{plural(sources.length, "source")}</span>
            <span className="text-muted-foreground">
              {issues.length === 0 ? "aucun incident de collecte" : `${plural(issues.length, "incident")} de collecte`}
            </span>
          </span>
        }
      >
        <div className="grid gap-2 px-0 pt-1 min-[900px]:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 overflow-x-auto rounded-tile bg-surface-2/40 px-2">
            {sources.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">Aucune donnée collectée pour ce pays.</p>
            ) : (
              <SourcesTable sources={sources} />
            )}
          </div>
          <IssuesList issues={issues} />
        </div>
      </Disclosure>
    </div>
  );
}

function SourcesTable({ sources }: { sources: ReturnType<typeof collectSources> }) {
  return (
    <Table className="min-w-[36rem] [&_td]:py-3.5 [&_th]:h-12">
      <TableHeader>
        <TableRow className="border-line hover:bg-transparent">
          <TableHead>Source</TableHead>
          <TableHead>Période observée</TableHead>
          <TableHead>Collectée le</TableHead>
          <TableHead>Requête</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sources.map((s) => (
          <TableRow key={`${s.sourceId}|${s.queryRef}|${s.period?.end}`} className="border-line">
            <TableCell>
              <span className="flex items-center gap-2">
                <KindMarker kind={s.origin === "mock" ? "mock" : "observed"} />
                {s.sourceUrl ? (
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                    {SOURCE_LABELS[s.sourceId]}
                  </a>
                ) : (
                  SOURCE_LABELS[s.sourceId]
                )}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">{s.period ? `du ${s.period.start} au ${s.period.end}` : "non précisée"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(s.collectedAt)}</TableCell>
            <TableCell className="max-w-[16rem] truncate text-xs text-muted-foreground">{s.queryRef ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function IssuesList({ issues }: { issues: readonly CollectionIssue[] }) {
  return (
    <div className="rounded-tile bg-surface-2/40 px-4 py-4 sm:px-[18px]">
      <h3 className="text-sm font-medium">Incidents de collecte</h3>
      {issues.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aucun.</p>
      ) : (
        <ul className="mt-4 space-y-4 text-sm">
          {issues.map((i) => (
            <li key={`${i.providerId}|${i.code}`}>
              <span className="font-medium">{SOURCE_LABELS[i.providerId]}</span>
              <span className="ml-2 rounded-pill border border-line px-2.5 py-0.5 text-[11px] text-muted-foreground">{ISSUE_LABELS[i.code] ?? i.code}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function dedupeIssues(issues: readonly CollectionIssue[]): CollectionIssue[] {
  return [...new Map(issues.map((i) => [`${i.providerId}|${i.code}`, i])).values()];
}
