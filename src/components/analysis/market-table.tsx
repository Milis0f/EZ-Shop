import Link from "next/link";
import { CountryTag } from "@/components/data/country-tag";
import { DatumValue } from "@/components/data/datum-value";
import { advancedMessages } from "@/components/data/labels";
import { insufficient } from "@/domain/datum";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountryAnalysis } from "@/domain/analysis";
import { countryName } from "@/engine/report/localize";
import type { Locale } from "@/i18n/config";
import { formatCompact, formatInt, formatMoney, formatPct } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { sortByScore } from "./country-ranking";

const STICKY = "sticky left-0 z-20 bg-surface after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line transition-colors duration-[var(--dur-fast)]";

/**
 * Data sources v2, one row per country: eBay supply, what one unit costs once imported and the margin
 * at the owner's price, and the indirect interest signals. Rows follow the ranking order of the comparison above.
 */
export function MarketTable({ analysisId, countries, locale }: { analysisId: string; countries: readonly CountryAnalysis[]; locale: Locale }) {
  const rows = sortByScore(countries).filter((c) => c.signals);
  if (rows.length === 0) return null;
  const m = advancedMessages(locale).marketTable;
  /** Analyses stored before scoring 2026.10-v3 have no margins from the owner's inputs. */
  const notInOldAnalysis = insufficient(m.notInOldAnalysis);
  const money = (v: number) => formatMoney(v, locale);
  const pct = (v: number) => formatPct(v, locale);

  return (
    <div className="panel min-w-0 overflow-hidden p-1.5">
      <div className="overflow-x-auto rounded-[calc(var(--radius-panel)-6px)]">
        <Table className="min-w-[56rem] text-[13px] [&_td]:px-3 [&_td]:py-3.5 [&_th]:px-3 [&_[data-slot=tooltip-trigger]]:relative [&_[data-slot=tooltip-trigger]]:z-10">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(STICKY, "pl-5")}>{m.country}</TableHead>
              <TableHead className="text-right">{m.listings}</TableHead>
              <TableHead className="text-right">{m.duty}</TableHead>
              <TableHead className="text-right">{m.landed}</TableHead>
              <TableHead className="text-right">{m.margin}</TableHead>
              <TableHead className="text-right">{m.china}</TableHead>
              <TableHead className="text-right">{m.suggestions}</TableHead>
              <TableHead className="pr-5 text-right">{m.youtube}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              const s = c.signals!;
              const href = `/analyses/${analysisId}/${c.country.toLowerCase()}#marketplace`;
              return (
                <TableRow key={c.country} className="group relative border-line transition-colors duration-[var(--dur-fast)] hover:bg-surface-2">
                  <TableCell className={cn(STICKY, "pl-5 group-hover:bg-surface-2")}>
                    <Link href={href} className="flex items-center gap-2 font-medium underline-offset-4 group-hover:underline">
                      <CountryTag code={c.country} />
                      {countryName(c.country, locale)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketplace} format={(v) => formatCompact(v.listings, locale)} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.taxes} format={(v) => (v.dutyPerUnitEur === null ? m.notComputed : money(v.dutyPerUnitEur))} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.landedUnitCostEur ?? notInOldAnalysis} format={money} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marginAtPlannedPrice ?? notInOldAnalysis} format={pct} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketplace} format={(v) => (v.chinaShare === null ? "—" : pct(v.chinaShare * 100))} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.searchSuggestions} format={(g) => t(m.suggestionCount, { count: formatInt(g.suggestions.length, locale), intent: formatInt(g.intent.length, locale) })} compact />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <DatumValue datum={s.content} format={(v) => formatCompact(v.videosLast12Months, locale)} compact />
                    <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
