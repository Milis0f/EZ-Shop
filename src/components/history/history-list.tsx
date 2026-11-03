import Link from "next/link";
import { connection } from "next/server";
import { VERDICT_COLOR } from "@/components/analysis/verdict-colors";
import { DatabaseNotice } from "@/components/data/database-notice";
import { TermBar } from "@/components/marketing/term";
import { countryName } from "@/components/search/display-names";
import { isCountryCode } from "@/domain/country";
import { HISTORY_KINDS, historyQuerySchema, type HistoryEntry, type HistoryQuery } from "@/domain/history";
import type { Locale } from "@/i18n/config";
import { verdictWord } from "@/engine/report/localize";
import { formatDate, formatInt, formatPct } from "@/i18n/format";
import type { Messages } from "@/i18n/messages";
import { getLocale, getMessages } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { LocalDatabaseError } from "@/server/db/client";
import { listHistory } from "@/server/history";
import { RemoveEntry } from "./remove-entry";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The query of the page address, checked: anything unknown falls back to "everything, newest first". */
export function historyQueryOf(params: Params): HistoryQuery {
  return historyQuerySchema.parse({ kind: first(params.kind), q: first(params.q) || undefined, order: first(params.order) });
}

function hrefWith(query: HistoryQuery, change: Partial<HistoryQuery>): string {
  const next = { ...query, ...change };
  const search = new URLSearchParams();
  if (next.kind) search.set("kind", next.kind);
  if (next.q) search.set("q", next.q);
  if (next.order === "oldest") search.set("order", "oldest");
  const text = search.toString();
  return text ? `/analyses?${text}` : "/analyses";
}

export async function HistoryList({ params }: { readonly params: Promise<Params> }) {
  await connection();
  const [query, locale, m] = await Promise.all([params.then(historyQueryOf), getLocale(), getMessages("history")]);
  const entries = await listHistory(query).catch((error: unknown) => (error instanceof LocalDatabaseError ? null : Promise.reject(error)));
  if (entries === null) return <DatabaseNotice />;

  const chip = (active: boolean) =>
    cn("interactive rounded-pill border px-3 py-1.5 font-mono text-xs tracking-[-0.02em]", active ? "border-foreground text-foreground" : "border-line text-muted-foreground hover:text-foreground");

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label={m.title} className="flex flex-wrap gap-2">
        <Link href={hrefWith(query, { kind: undefined })} className={chip(!query.kind)} aria-current={!query.kind ? "page" : undefined}>
          {m.kinds.all}
        </Link>
        {HISTORY_KINDS.map((kind) => (
          <Link key={kind} href={hrefWith(query, { kind })} className={chip(query.kind === kind)} aria-current={query.kind === kind ? "page" : undefined}>
            {m.kinds[kind]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
        <form action="/analyses" method="get" role="search" className="flex min-w-0 flex-1 gap-2">
          {query.kind && <input type="hidden" name="kind" value={query.kind} />}
          {query.order === "oldest" && <input type="hidden" name="order" value="oldest" />}
          <label className="sr-only" htmlFor="history-q">
            {m.search}
          </label>
          <input
            id="history-q"
            name="q"
            type="search"
            maxLength={120}
            defaultValue={query.q ?? ""}
            placeholder={m.searchPlaceholder}
            className="h-10 min-w-0 flex-1 rounded-pill border border-line bg-surface px-4 text-sm"
          />
          <button type="submit" className="interactive h-10 shrink-0 rounded-pill border border-line px-4 text-sm hover:bg-secondary">
            {m.searchSubmit}
          </button>
        </form>
        <Link href={hrefWith(query, { order: query.order === "oldest" ? "newest" : "oldest" })} className="shrink-0 text-sm underline decoration-line underline-offset-4 hover:decoration-foreground">
          {query.order === "oldest" ? m.oldest : m.newest}
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-tile border border-dashed border-foreground/15 px-6 py-10 text-center text-sm text-muted-foreground">{query.q ? t(m.emptySearch, { q: query.q }) : m.empty}</p>
      ) : (
        <div className="term overflow-hidden">
          <TermBar title="~/historique — ls" />
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <HistoryRow key={`${entry.kind}:${entry.id}`} entry={entry} locale={locale} m={m} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, locale, m }: { readonly entry: HistoryEntry; readonly locale: Locale; readonly m: Messages<"history"> }) {
  const details = [
    m.kind[entry.kind],
    formatDate(entry.createdAt, locale),
    ...entry.countries.filter(isCountryCode).map((c) => countryName(c, locale)),
    ...(entry.sourceCount !== null ? [t(m.sources, { count: formatInt(entry.sourceCount, locale) })] : []),
  ];
  return (
    <li className="flex min-w-0 items-center gap-3 px-5 py-3 sm:px-6">
      <Link href={entry.href} className="interactive group min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-ring">
        <span className="block truncate font-mono text-[0.9375rem] font-medium tracking-[-0.03em] group-hover:underline">{entry.title}</span>
        <span className="mt-0.5 block truncate font-mono text-xs tracking-[-0.02em] text-muted-foreground">
          {details.join(" · ")}
          {entry.status !== "completed" && <span className="ml-2 text-foreground">{m.statuses[entry.status]}</span>}
        </span>
      </Link>
      {entry.verdict && (
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-medium tracking-[-0.03em]" style={{ color: VERDICT_COLOR[entry.verdict.value] }}>
            {verdictWord(entry.verdict.value, locale)}
          </span>
          <span className="tabular mt-0.5 block text-xs text-muted-foreground">{formatPct(Math.round(entry.verdict.confidence), locale)}</span>
        </span>
      )}
      <RemoveEntry kind={entry.kind} id={entry.id} title={entry.title} />
    </li>
  );
}
