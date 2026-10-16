import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectorDialog } from "@/components/connectors/connector-dialog";
import { ConnectorFrame, FreshNote } from "@/components/connectors/connector-frame";
import type { FieldState } from "@/config/connector-fields";
import { CONNECTOR_GROUPS, CONNECTOR_GUIDES } from "@/config/connector-guides";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProviderState } from "@/domain/analysis";
import { PROVIDER_STATE_LABELS, VERIFICATION_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProviderMeta } from "@/providers/contracts";
import { fieldStates, getEnvEditorAccess } from "@/server/connector-config";
import { getConnectorOverview } from "@/server/services";

export const metadata: Metadata = { title: "Sources de données" };

const STATE_TONE: Record<ProviderState, { pill: string; segment: string }> = {
  ready: { pill: "bg-kind-observed/12 text-kind-observed", segment: "bg-kind-observed" },
  not_configured: { pill: "bg-surface-2 text-foreground", segment: "bg-foreground/25" },
  not_implemented: { pill: "hatch bg-surface-2 text-muted-foreground", segment: "bg-foreground/10" },
  mock: { pill: "bg-kind-mock/12 text-kind-mock", segment: "bg-kind-mock" },
};

const STATE_ORDER: readonly ProviderState[] = ["ready", "not_configured", "not_implemented", "mock"];

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
        <h1 className="text-3xl font-semibold tracking-tight">Sources de données</h1>
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

function StatePill({ state }: { state: ProviderState }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap", STATE_TONE[state].pill)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {PROVIDER_STATE_LABELS[state]}
    </span>
  );
}

async function ConnectorList() {
  await connection();
  const [{ connectors, mockAllowed }, editor] = await Promise.all([getConnectorOverview(), getEnvEditorAccess()]);
  const ready = connectors.filter((c) => c.status.state === "ready").length;
  const counts = STATE_ORDER.map((s) => [s, connectors.filter((c) => c.status.state === s).length] as const).filter(([, n]) => n > 0);

  return (
    <>
      <section aria-label="Résumé" className="panel animate-enter mt-12 p-6" style={{ "--stagger": 1 } as React.CSSProperties}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight tabular">{ready}</span>
            <span className="text-muted-foreground">sources prêtes sur {connectors.length}</span>
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {counts.map(([state, n]) => (
              <li key={state} className="flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-full", STATE_TONE[state].segment)} />
                {PROVIDER_STATE_LABELS[state]} <span className="tabular text-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="mt-5 flex gap-1">
          {connectors.map(({ meta, status }, i) => (
            <span key={meta.id} className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span className={cn("animate-bar block h-full rounded-full", STATE_TONE[status.state].segment)} style={{ "--stagger": i } as React.CSSProperties} />
            </span>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Données fictives de développement :{" "}
          {mockAllowed ? "autorisées dans cet environnement." : "désactivées (production ou ALLOW_MOCK_DATA=false)."}
        </p>
      </section>

      {CONNECTOR_GROUPS.map((group) => {
        const items = connectors.filter((c) => CONNECTOR_GUIDES[c.meta.id]?.group === group.id);
        if (items.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={`group-${group.id}`} className="mt-16">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id={`group-${group.id}`} className="text-lg font-semibold tracking-tight">
                {group.title}
              </h2>
              <p className="text-sm text-muted-foreground">{group.intro}</p>
            </div>
            <ul className="grid gap-4 lg:grid-cols-2">
              {items.map(({ meta, status }) => {
                const fields = fieldStates(meta);
                const guide = CONNECTOR_GUIDES[meta.id];
                return (
                  <ConnectorFrame
                    key={meta.id}
                    id={meta.id}
                    ready={status.state === "ready"}
                    className="panel flex flex-col gap-4 p-5 transition-colors duration-[var(--dur-fast)] hover:border-foreground/15"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <a
                          href={meta.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group/link inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                        >
                          {meta.name}
                          <ArrowUpRight
                            className="size-3.5 text-muted-foreground transition-transform duration-[var(--dur-fast)] group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                            aria-hidden
                          />
                        </a>
                        {meta.coverage.kind === "list" && <p className="mt-1 text-xs text-muted-foreground">{meta.coverage.note}</p>}
                      </div>
                      <StatePill state={status.state} />
                    </div>

                    <p className="text-sm leading-relaxed">{guide?.brings ?? meta.notes[0]}</p>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {guide && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">{guide.cost}</span>}
                      {guide?.setupTime && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted-foreground">{guide.setupTime}</span>}
                      {meta.unofficial && (
                        <span title={meta.notes[1] ?? undefined} className="rounded-full border border-decision-test/40 px-2 py-0.5 text-decision-test">
                          Non officiel
                        </span>
                      )}
                    </div>

                    {fields.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {fields.map((f) => (
                          <code
                            key={f.name}
                            title={f.set ? "Définie" : f.optional ? "Facultative" : "À renseigner"}
                            className={cn(
                              "rounded-md px-2 py-1 text-[11px] break-all",
                              f.set ? "bg-surface-2 text-foreground" : "border border-dashed border-foreground/25 text-muted-foreground",
                            )}
                          >
                            {f.name}
                          </code>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto flex items-end justify-between gap-4 border-t border-line pt-4 text-xs">
                      <div className="min-w-0 space-y-1">
                        <p className="text-muted-foreground">{footerDetail(fields, status.detail)}</p>
                        <p className={cn(meta.verification === "live_verified" ? "text-foreground" : "text-muted-foreground")}>
                          {VERIFICATION_LABELS[meta.verification]}
                        </p>
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
                          pill={<StatePill state={status.state} />}
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
      <Skeleton className="mt-12 h-36 rounded-[0.875rem]" />
      <Skeleton className="mt-16 h-5 w-56" />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-52 rounded-[0.875rem]" />
        ))}
      </div>
    </div>
  );
}
