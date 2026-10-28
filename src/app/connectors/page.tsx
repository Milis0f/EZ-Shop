import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ConnectorDialog } from "@/components/connectors/connector-dialog";
import { ConnectorFrame, FreshNote } from "@/components/connectors/connector-frame";
import { SOURCE_STATUS_ORDER, sourceStatus, StatusChip, StatusDot, type SourceStatus } from "@/components/connectors/source-status";
import { ProgressRing } from "@/components/motion/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import type { FieldState } from "@/config/connector-fields";
import { connectorGroups, connectorGuides } from "@/config/connector-guides";
import type { ProviderState } from "@/domain/analysis";
import type { Locale } from "@/i18n/config";
import { formatInt } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getLocale, getMessages } from "@/i18n/server";
import { plural, t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import type { ProviderMeta } from "@/providers/contracts";
import { fieldStates } from "@/server/connector-config";
import { getConnectorOverview } from "@/server/services";
import { localizedEditorAccess } from "./editor-access";

type ConnectorMessages = Messages<"connectors">;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("connectors");
  return { title: m.page.title };
}

/**
 * Footer line: the count of required variables still missing, or else a short line for the provider state.
 * The provider's own detail is French only, so the line is derived from the state and the access model.
 */
function footerDetail(fields: readonly FieldState[], state: ProviderState, access: ProviderMeta["access"], m: ConnectorMessages, locale: Locale): string {
  const missing = fields.filter((f) => !f.optional && !f.set).length;
  if (missing > 0) return plural(locale, missing, m.page.missingVars, { count: formatInt(missing, locale) });
  switch (state) {
    case "ready":
      return access === "open" ? m.statusDetail.open : m.statusDetail.configured;
    case "not_implemented":
      return m.statusDetail.notImplemented;
    default:
      return m.statusDetail.notConfigured;
  }
}

/** Coverage note of a source limited to some countries, in the active language when the dictionary has it. */
function coverageNote(meta: ProviderMeta, m: ConnectorMessages): string | null {
  if (meta.coverage.kind !== "list") return null;
  const notes: Readonly<Record<string, string>> = m.coverage;
  return notes[meta.id] ?? meta.coverage.note;
}

export default async function ConnectorsPage() {
  const locale = await getLocale();
  const m = await getMessages("connectors", locale);
  return (
    <div className="mx-auto max-w-6xl">
      <header className="animate-enter max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{m.page.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.page.intro}</p>
      </header>
      <Suspense fallback={<ConnectorsSkeleton label={m.page.loading} />}>
        <ConnectorList locale={locale} m={m} />
      </Suspense>
    </div>
  );
}

interface SummaryProps {
  readonly statuses: ReadonlyArray<{ readonly id: string; readonly name: string; readonly status: SourceStatus }>;
  readonly locale: Locale;
  readonly m: ConnectorMessages;
}

/** One ring for the share of sources ready, one dot per source in page order, and the count of each state. */
function Summary({ statuses, locale, m }: SummaryProps) {
  const total = statuses.length;
  const ready = statuses.filter((s) => s.status === "ready").length;
  const counts = SOURCE_STATUS_ORDER.map((s) => [s, statuses.filter((x) => x.status === s).length] as const).filter(([, n]) => n > 0);
  const n = (value: number) => formatInt(value, locale);

  return (
    <section
      aria-label={m.page.summary}
      className="panel animate-enter mt-10 flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:gap-8 sm:p-8 sm:text-left"
      style={{ "--stagger": 1 } as React.CSSProperties}
    >
      <ProgressRing
        value={total > 0 ? (ready / total) * 100 : 0}
        size={116}
        thickness={9}
        aria-label={t(m.page.ringLabel, { ready: n(ready), total: n(total) })}
      >
        <span className="text-3xl font-semibold tracking-tight tabular">{n(ready)}</span>
        <span className="text-xs text-muted-foreground">
          {m.page.ringOf} <span className="tabular">{n(total)}</span>
        </span>
      </ProgressRing>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold tracking-tight">{plural(locale, ready, m.page.readyCount, { count: n(ready), total: n(total) })}</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          {counts.map(([status, count]) => (
            <li key={status} className="inline-flex h-8 items-center gap-2 rounded-pill bg-surface-2 px-3.5 text-[13px] text-muted-foreground">
              <StatusDot status={status} />
              {m.status[status]}
              <span className="tabular text-foreground">{n(count)}</span>
            </li>
          ))}
        </ul>
        <ul aria-hidden className="mt-5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
          {statuses.map((s) => (
            <li key={s.id} title={t(m.page.dotTitle, { name: s.name, status: m.status[s.status] })}>
              <StatusDot status={s.status} className="size-3" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function ConnectorList({ locale, m }: { readonly locale: Locale; readonly m: ConnectorMessages }) {
  await connection();
  const [{ connectors }, editor] = await Promise.all([getConnectorOverview(), localizedEditorAccess(locale)]);
  const guides = connectorGuides(locale);
  const rows = connectors.map(({ meta, status }) => {
    const fields = fieldStates(meta);
    return { meta, status, fields, display: sourceStatus(status.state, fields) };
  });

  return (
    <>
      <Summary statuses={rows.map((r) => ({ id: r.meta.id, name: r.meta.name, status: r.display }))} locale={locale} m={m} />

      {connectorGroups(locale).map((group) => {
        const items = rows.filter((r) => guides[r.meta.id]?.group === group.id);
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
                const guide = guides[meta.id];
                const coverage = coverageNote(meta, m);
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
                          <span className="sr-only">{m.page.docsNewTab}</span>
                        </a>
                        {coverage && <p className="mt-1 text-xs text-muted-foreground">{coverage}</p>}
                      </div>
                      <StatusChip status={display} label={m.status[display]} />
                    </div>

                    <p className="text-[15px] leading-relaxed text-foreground/90">{guide?.brings ?? meta.notes[0]}</p>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {guide && <span className="rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">{guide.cost}</span>}
                      {guide?.setupTime && <span className="rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">{guide.setupTime}</span>}
                      {meta.unofficial && (
                        <span
                          title={guide?.unofficialNote ?? meta.notes[1] ?? undefined}
                          className="rounded-pill border border-dashed border-muted-foreground/50 px-3 py-1 text-muted-foreground"
                        >
                          {m.page.unofficial}
                        </span>
                      )}
                    </div>

                    {fields.length > 0 && (
                      <ul aria-label={m.page.variables} className="flex flex-wrap gap-1.5">
                        {fields.map((f) => (
                          <li key={f.name} className="min-w-0">
                            <code
                              title={f.set ? m.fieldState.set : f.optional ? m.fieldState.optional : m.fieldState.missing}
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
                        <p className="text-foreground">{footerDetail(fields, status.state, meta.access, m, locale)}</p>
                        <p className="text-muted-foreground">{m.verification[meta.verification]}</p>
                        <FreshNote />
                      </div>
                      {fields.length > 0 && (
                        <ConnectorDialog
                          providerId={meta.id}
                          name={meta.name}
                          docsUrl={meta.docsUrl}
                          accessLabel={m.access[meta.access]}
                          verification={meta.verification}
                          fields={fields}
                          editor={editor}
                          pill={<StatusChip status={display} label={m.status[display]} />}
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

function ConnectorsSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label}>
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
