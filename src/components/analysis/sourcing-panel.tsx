import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { DatumValue } from "@/components/data/datum-value";
import { Stat } from "@/components/country/panels";
import { isKnown, type Datum } from "@/domain/datum";
import { advancedMessages, originCountryName } from "@/components/data/labels";
import type { OriginCode } from "@/domain/origin";
import type { HsClassification, SourcingOffer } from "@/domain/signals";
import type { Locale } from "@/i18n/config";
import { formatInt, formatMoney } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { engineText } from "@/components/data/engine-text";

interface SourcingPanelProps {
  readonly origin?: OriginCode;
  readonly classification?: Datum<HsClassification>;
  readonly sourcing?: Datum<SourcingOffer>;
  readonly locale: Locale;
}

/** 6115 95 00 00; a prefix shorter than 6 digits covers a group of lines: "6115 9x". */
const formatHs = (code: string) =>
  code.length < 6 && code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}${"x".repeat(6 - code.length)}` : (code.match(/^\d{4}|\d{2}/g) ?? [code]).join(" ");

/** What the product costs to source and how customs see it: shared by every country of the analysis. */
export function SourcingPanel({ origin, classification, sourcing, locale }: SourcingPanelProps) {
  if (!classification && !sourcing) return null;
  const m = advancedMessages(locale).sourcing;
  const money = (v: number) => formatMoney(v, locale);
  return (
    <div className="panel grid min-w-0 gap-8 p-5 sm:p-[26px] min-[900px]:grid-cols-[22rem_minmax(0,1fr)] min-[900px]:gap-12">
      <dl className="grid content-start gap-6">
        <Stat label={m.origin}>{origin ? originCountryName(origin, locale) : <span className="text-muted-foreground">{m.notProvided}</span>}</Stat>
        {classification && (
          <Stat
            label={m.hsCode}
            hint={isKnown(classification) ? (classification.value.method === "user" ? m.hsUser : m.hsSearch) : undefined}
          >
            <DatumValue
              datum={classification}
              format={(c) => (
                <span className="flex flex-col">
                  <span className="font-medium">{formatHs(c.code)}</span>
                  <span className="text-xs text-muted-foreground">{engineText(c.description, locale)}</span>
                </span>
              )}
            />
          </Stat>
        )}
        {classification && !isKnown(classification) && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {m.noCode}
          </p>
        )}
      </dl>

      <div className="min-w-0 min-[900px]:border-l min-[900px]:border-line min-[900px]:pl-12">
        <h3 className="text-sm font-medium">{m.aliTitle}</h3>
        {!sourcing || !isKnown(sourcing) ? (
          <div className="mt-3 text-sm">
            {sourcing && <DatumValue datum={sourcing} format={() => null} />}
            <p className="mt-2 text-xs text-muted-foreground">
              {m.connectAli}{" "}
              <Link href="/connectors" className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline">
                {m.dataSources}
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </p>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3">
              <Stat label={m.median} hint={m.excludingShipping}>
                <DatumValue datum={sourcing} format={(s) => <AnimatedNumber value={s.priceEur.median} format="money" />} />
              </Stat>
              <Stat label={m.range}>
                <DatumValue datum={sourcing} format={(s) => t(m.rangeValue, { min: money(s.priceEur.p25), max: money(s.priceEur.p75) })} />
              </Stat>
              <Stat label={m.recentSales} hint={t(m.recentSalesHint, { count: formatInt(sourcing.value.sampled, locale) })}>
                <DatumValue datum={sourcing} format={(s) => (s.recentOrders === null ? "—" : <AnimatedNumber value={s.recentOrders} format="int" />)} />
              </Stat>
            </dl>
            <ul className="mt-6 flex flex-col gap-1.5">
              {sourcing.value.topProducts.map((p) => (
                <li key={p.url || p.title} className="flex items-center justify-between gap-4 rounded-tile bg-surface-2/50 px-4 py-3 text-sm">
                  <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-4 hover:underline">
                    {p.title}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{money(p.priceEur)}</span>
                    {p.orders !== null && <>, {t(m.sales, { count: formatInt(p.orders, locale) })}</>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
