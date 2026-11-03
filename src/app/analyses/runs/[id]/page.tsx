import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DatabaseNotice } from "@/components/data/database-notice";
import { RemoveEntry } from "@/components/history/remove-entry";
import { SavedRunReport, type SavedReport } from "@/components/history/saved-run";
import { TermPrompt } from "@/components/marketing/term";
import { Skeleton } from "@/components/ui/skeleton";
import { deepReportSchema } from "@/domain/deep-research";
import { competitorResponseSchema, webResearchResponseSchema } from "@/domain/web";
import { formatDate, formatInt } from "@/i18n/format";
import { getLocale, getMessages } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { LocalDatabaseError } from "@/server/db/client";
import { getRun } from "@/server/history";
import type { RunRecord } from "@/server/repositories";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("history");
  return { title: m.title };
}

/** The stored report read back through its own schema: a report this version cannot read is not shown. */
function savedReportOf(run: RunRecord): SavedReport | null {
  if (run.result === null) return null;
  if (run.kind === "deep_research") {
    const parsed = deepReportSchema.safeParse(run.result);
    return parsed.success ? { kind: "deep_research", report: parsed.data } : null;
  }
  if (run.kind === "competitor") {
    const parsed = competitorResponseSchema.safeParse(run.result);
    return parsed.success && parsed.data.status === "ready" ? { kind: "competitor", report: parsed.data } : null;
  }
  const parsed = webResearchResponseSchema.safeParse(run.result);
  return parsed.success && parsed.data.status === "ready" ? { kind: "web_research", report: parsed.data } : null;
}

async function SavedRun({ params }: { readonly params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const run = await getRun(id).catch((error: unknown) => (error instanceof LocalDatabaseError ? undefined : Promise.reject(error)));
  if (run === undefined) return <DatabaseNotice />;
  if (!run) notFound();
  const [m, locale] = await Promise.all([getMessages("history"), getLocale()]);
  const saved = savedReportOf(run);
  const askedUrl = (run.params as { url?: unknown } | null)?.url;
  const details = [
    m.kind[run.kind],
    `${m.run.asked} ${formatDate(run.createdAt, locale)}`,
    m.statuses[run.status],
    ...(run.durationMs !== null ? [t(m.run.done, { seconds: formatInt(Math.round(run.durationMs / 1000), locale) })] : []),
    ...(run.model ? [t(m.run.model, { model: run.model })] : []),
  ];

  return (
    <>
      <header className="animate-enter mb-8 max-w-3xl">
        <TermPrompt command="ez-shop analyses --open" className="mb-5" />
        <h1 className="page-title break-words">{run.title}</h1>
        <p className="mt-3 font-mono text-xs tracking-[-0.02em] text-muted-foreground">{details.join(" · ")}</p>
        {run.error && <p className="mt-2 text-sm text-muted-foreground">{t(m.run.error, { error: run.error })}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm">
          <Link href="/analyses" className="underline decoration-line underline-offset-4 hover:decoration-foreground">
            {m.back}
          </Link>
          {run.kind === "competitor" && typeof askedUrl === "string" && (
            <Link href={`/competitor?url=${encodeURIComponent(askedUrl)}`} className="underline decoration-line underline-offset-4 hover:decoration-foreground">
              {m.run.checkAgain}
            </Link>
          )}
          <RemoveEntry kind={run.kind} id={run.id} title={run.title} onRemoved="/analyses" />
        </div>
      </header>
      {saved ? (
        <SavedRunReport saved={saved} />
      ) : (
        <p className="rounded-tile border border-dashed border-foreground/15 px-6 py-10 text-center text-sm text-muted-foreground">{run.result === null ? m.run.noReport : m.run.unreadable}</p>
      )}
    </>
  );
}

export default function SavedRunPage({ params }: { readonly params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-5xl pt-[3vh]">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-tile" />}>
        <SavedRun params={params} />
      </Suspense>
    </div>
  );
}
