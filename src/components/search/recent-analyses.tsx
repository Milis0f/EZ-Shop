import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { VERDICT_COLOR } from "@/components/analysis/verdict-colors";
import { TermBar } from "@/components/marketing/term";
import { verdictWord } from "@/engine/report/localize";
import { formatDate, formatInt, formatPct } from "@/i18n/format";
import { getLocale, getMessages } from "@/i18n/server";
import { plural, t } from "@/i18n/translate";
import { DatabaseNotice } from "@/components/data/database-notice";
import { LocalDatabaseError } from "@/server/db/client";
import { listRecentAnalyses } from "@/server/services";
import { countryName } from "./display-names";

/** How many stay on the home page: enough to pick up a recent one without burying the rest. */
const SHOWN = 6;

/** The last analyses as rows: product, date, and the same verdict its report opens with. */
export async function RecentAnalyses({ limit = SHOWN }: { readonly limit?: number } = {}) {
  await connection();
  const [analyses, locale] = await Promise.all([listRecentAnalyses(limit).catch((error: unknown) => (error instanceof LocalDatabaseError ? null : Promise.reject(error))), getLocale()]);
  if (analyses === null) return <DatabaseNotice />;
  const m = await getMessages("home", locale).then((home) => home.recent);

  if (analyses.length === 0) {
    return (
      <p className="rounded-tile border border-dashed border-foreground/15 px-6 py-10 text-center text-sm text-muted-foreground">
        {m.empty}
      </p>
    );
  }

  return (
    <div className="term overflow-hidden">
      <TermBar title="~/analyses — ls" />
    <ul className="divide-y divide-line">
      {analyses.map((a) => (
        <li key={a.id} className="min-w-0">
          <Link
            href={`/analyses/${a.id}`}
            className="interactive group flex h-full items-center gap-4 px-5 py-3.5 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[0.9375rem] font-medium tracking-[-0.03em]">{a.productName}</span>
              <span className="mt-0.5 block truncate font-mono text-xs tracking-[-0.02em] text-muted-foreground">
                {plural(locale, a.countryCount, m.countries, { date: formatDate(a.createdAt, locale), count: formatInt(a.countryCount, locale) })}
                {a.dataMode === "mock" && <span className="ml-2">{m.oldMock}</span>}
                {a.status === "failed" && <span className="ml-2 text-foreground">{m.failed}</span>}
              </span>
            </span>
            {a.verdict ? (
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm font-medium tracking-[-0.03em]" style={{ color: VERDICT_COLOR[a.verdict.value] }}>
                  {verdictWord(a.verdict.value, locale)}
                </span>
                <span className="tabular mt-0.5 block text-xs text-muted-foreground">
                  {t(m.verdictDetail, { country: countryName(a.verdict.country, locale), confidence: formatPct(Math.round(a.verdict.confidence), locale) })}
                </span>
              </span>
            ) : (
              <span className="shrink-0 text-sm text-muted-foreground">{m.noCountry}</span>
            )}
            <ChevronRight
              aria-hidden
              strokeWidth={1.5}
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:text-foreground"
            />
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}
