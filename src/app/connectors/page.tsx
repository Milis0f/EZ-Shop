import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectorDialog } from "@/components/connectors/connector-dialog";
import { ConnectorFrame, FreshNote } from "@/components/connectors/connector-frame";
import { SOURCE_STATUS_LABELS, SOURCE_STATUS_ORDER, sourceStatus, StatusChip, StatusDot, type SourceStatus } from "@/components/connectors/source-status";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import type { FieldState } from "@/config/connector-fields";
import { CONNECTOR_GROUPS, CONNECTOR_GUIDES } from "@/config/connector-guides";
import { VERIFICATION_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProviderMeta } from "@/providers/contracts";
import { fieldStates, getEnvEditorAccess } from "@/server/connector-config";
import { getConnectorOverview } from "@/server/services";

export const metadata: Metadata = { title: "Sources de données" };

const ACCESS_LABELS: Record<ProviderMeta["access"], string> = {
  open: "Ouverte, sans compte",
  account: "Compte requis",
  approval: "Candidature et approbation",
};

/** Footer line: the count of required variables still missing, or the provider's own status detail. */
function footerDetail(fields: readonly FieldState[], detail: string): string {
  const missing = fields.filter((f) => !f.optional && !f.set).length;
  return missing > 0 ? `${missing} variable${missing > 1 ? "s" : ""} à renseigner` : detail;
}

export default function ConnectorsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Sources de données</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          Les sources ouvertes travaillent déjà à chaque analyse, sans compte. Les autres se branchent ici avec « Configurer » : un guide pas à pas,
          les champs à remplir, puis un test réel. Une source non branchée ne produit jamais de valeur : ce qui en dépend reste en données
          insuffisantes.
        </p>
      </header>
      <Suspense fallback={<ConnectorsSkeleton />}>
        <ConnectorList />
      </Suspense>
    </div>
  );
}

interface SummaryProps {
  readonly statuses: ReadonlyArray<{ readonly id: string; readonly name: string; readonly status: SourceStatus }>;
}

/** One ring for the share of sources ready, one dot per source in page order, and the count of each state. */
function Summary({ statuses }: SummaryProps) {
  const total = statuses.length;
  const ready = statuses.filter((s) => s.status === "ready").length;
  const counts = SOURCE_STATUS_ORDER.map((s) => [s, statuses.filter((x) => x.status === s).length] as const).filter(([, n]) => n > 0);

  return (
    <section
      aria-label="Résumé"
      className="panel animate-enter mt-10 flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:gap-8 sm:p-8 sm:text-left"
      style={{ "--stagger": 1 } as React.CSSProperties}
    >
      <ProgressRing value={total > 0 ? (ready / total) * 100 : 0} size={116} thickness={9} aria-label={`${ready} sources prêtes sur ${total}`}>
        <span className="text-3xl font-semibold tracking-tight tabular">{ready}</span>
        <span className="text-xs text-muted-foreground">
          sur <span className="tabular">{total}</span>
        </span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold tracking-tight">
          {ready} source{ready > 1 ? "s" : ""} prête{ready > 1 ? "s" : ""} sur {total}
        </p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          {counts.map(([status, n]) => (
            <li key={status} className="inline-flex h-8 items-center gap-2 rounded-pill bg-surface-2 px-3.5 text-[13px] text-muted-foreground">
              <StatusDot status={status} />
              {SOURCE_STATUS_LABELS[status]}
              <span className="tabular text-foreground">{n}</span>
            </li>
          ))}
        </ul>
        <ul aria-hidden className="mt-5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
          {statuses.map((s) => (
            <li key={s.id} title={`${s.name} : ${SOURCE_STATUS_LABELS[s.status]}`}>
              <StatusDot status={s.status} className="size-3" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function ConnectorList() {
  await connection();
  const [{ connectors }, editor] = await Promise.all([getConnectorOverview(), getEnvEditorAccess()]);
  const rows = connectors.map(({ meta, status }) => {
    const fields = fieldStates(meta);
    return { meta, status, fields, display: sourceStatus(status.state, fields) };
  });

  return (
    <>
      <Summary statuses={rows.map((r) => ({ id: r.meta.id, name: r.meta.name, status: r.display }))} />

      {CONNECTOR_GROUPS.map((group) => {
        const items = rows.filter((r) => CONNECTOR_GUIDES[r.meta.id]?.group === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="mt-14">
            <div className="mb-5 px-1">
              <h2 id={`group-${group.id}`} className="text-xl font-semibold tracking-tight">
                {group.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{group.intro}</p>
            </div>
            <ul className="grid gap-4 min-[900px]:grid-cols-2">
              {items.map(({ meta, status, fields, display }) => {
                const guide = CONNECTOR_GUIDES[meta.id];
                return (
                  <ConnectorFrame key={meta.id} id={meta.id} ready={status.state === "ready"} className="panel flex min-w-0 flex-col gap-4 p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 pt-1">
                        <a
                          href={meta.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group/link inline-flex items-center gap-1 rounded-pill text-[17px] font-semibold tracking-tight underline-offset-4 hover:underline"
                        >
                          {meta.name}
                          <ArrowUpRight
                            className="size-4 text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                          <span className="sr-only">(documentation, nouvel onglet)</span>
                        </a>
                        {meta.coverage.kind === "list" && <p className="mt-1 text-xs text-muted-foreground">{meta.coverage.note}</p>}
                      </div>
                      <StatusChip status={display} />
                    </div>

                    <p className="text-[15px] leading-relaxed text-foreground/90">{guide?.brings ?? meta.notes[0]}</p>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {guide && <span className="rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">{guide.cost}</span>}
                      {guide?.setupTime && <span className="rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">{guide.setupTime}</span>}
                      {meta.unofficial && (
                        <span title={meta.notes[1] ?? undefined} className="rounded-pill border border-dashed border-muted-foreground/50 px-3 py-1 text-muted-foreground">
                          Non officiel
                        </span>
                      )}
                    </div>

                    {fields.length > 0 && (
                      <ul aria-label="Variables" className="flex flex-wrap gap-1.5">
                        {fields.map((f) => (
                          <li key={f.name} className="min-w-0">
                            <code
                              title={f.set ? "Définie" : f.optional ? "Facultative" : "À renseigner"}
                              className={cn(
                                "inline-block max-w-full rounded-pill px-3 py-1 text-[11px] break-all",
                                f.set ? "bg-surface-2 text-foreground" : "border border-dashed border-foreground/25 text-muted-foreground",
                              )}
                            >
                              {f.name}
                            </code>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-4 rounded-tile bg-surface-2 py-3 pr-3 pl-5 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-foreground">{footerDetail(fields, status.detail)}</p>
                        <p className="text-muted-foreground">{VERIFICATION_LABELS[meta.verification]}</p>
                        <FreshNote />
                      </div>
                      {fields.length > 0 && (
                        <ConnectorDialog
                          providerId={meta.id}
                          name={meta.name}
                          docsUrl={meta.docsUrl}
                          accessLabel={ACCESS_LABELS[meta.access]}
                          verification={meta.verification}
                          fields={fields}
                          editor={editor}
                          pill={<StatusChip status={display} />}
                        />
                      )}
                    </div>
                  </ConnectorFrame>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function ConnectorsSkeleton() {
  return (
    <div role="status" aria-label="Chargement des sources">
      <Skeleton className="mt-10 h-44 rounded-panel" />
      <Skeleton className="mt-14 h-6 w-56 rounded-pill" />
      <div className="mt-5 grid gap-4 min-[900px]:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-60 rounded-panel" />
        ))}
      </div>
    </div>
  );
}
