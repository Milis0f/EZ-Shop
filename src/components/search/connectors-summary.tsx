import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { connectorName } from "@/engine/report/localize";
import { formatInt } from "@/i18n/format";
import { getLocale, getMessages } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { getConnectorOverview } from "@/server/services";

/** How much of the data the next analysis can actually rely on: one segment per source. */
export async function ConnectorsSummary() {
  await connection();
  const [{ connectors }, locale] = await Promise.all([getConnectorOverview(), getLocale()]);
  const m = await getMessages("home", locale).then((home) => home.sources);
  const ready = connectors.filter((c) => c.status.state === "ready");

  return (
    <div className="panel p-6 text-sm">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular">{formatInt(ready.length, locale)}</span>
        <span className="text-muted-foreground">{t(m.readyOf, { total: formatInt(connectors.length, locale) })}</span>
      </p>
      <div aria-hidden className="mt-4 flex gap-1">
        {connectors.map(({ meta, status }, i) => (
          <span key={meta.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            {status.state === "ready" && (
              <span className="animate-bar block h-full rounded-full bg-kind-observed" style={{ "--stagger": i } as React.CSSProperties} />
            )}
          </span>
        ))}
      </div>
      <ul className="mt-6 space-y-3">
        {connectors.map(({ meta, status }) => {
          const ok = status.state === "ready";
          return (
            <li key={meta.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2.5">
              <span aria-hidden className={cn("size-1.5 translate-y-[-1px] rounded-full", ok ? "bg-kind-observed" : "bg-foreground/20")} />
              <span className="min-w-0 leading-snug">{connectorName(meta.id, locale)}</span>
              <span className={cn("text-xs whitespace-nowrap", ok ? "text-foreground" : "text-muted-foreground")}>{m.state[status.state]}</span>
            </li>
          );
        })}
      </ul>
      <Link
        href="/connectors"
        className="interactive mt-6 inline-flex items-center gap-1 rounded-md text-xs font-medium underline-offset-4 hover:underline"
      >
        {m.configure}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
