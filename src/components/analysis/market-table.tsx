import Link from "next/link";
import { CountryTag } from "@/components/data/country-tag";
import { DatumValue } from "@/components/data/datum-value";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountryAnalysis } from "@/domain/analysis";
import { COUNTRIES } from "@/domain/country";
import { formatCompact, formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sortByScore } from "./country-ranking";

const STICKY = "sticky left-0 z-20 bg-surface after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-line transition-colors duration-[var(--dur-fast)]";

/**
 * Data sources v2, one row per country: what the market shows (eBay), what one unit costs once
 * imported, and the indirect interest signals. Rows follow the ranking order of the comparison above.
 */
export function MarketTable({ analysisId, countries }: { analysisId: string; countries: readonly CountryAnalysis[] }) {
  const rows = sortByScore(countries).filter((c) => c.signals);
  if (rows.length === 0) return null;

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[56rem] text-[13px] [&_td]:px-3 [&_td]:py-3.5 [&_th]:px-3 [&_[data-slot=tooltip-trigger]]:relative [&_[data-slot=tooltip-trigger]]:z-10">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(STICKY, "pl-5")}>Pays</TableHead>
              <TableHead className="text-right">Annonces eBay</TableHead>
              <TableHead className="text-right">Prix médian HT</TableHead>
              <TableHead className="text-right">Droit / unité</TableHead>
              <TableHead className="text-right">Coût rendu</TableHead>
              <TableHead className="text-right">Marge marché</TableHead>
              <TableHead className="text-right">Vendeurs Chine</TableHead>
              <TableHead className="text-right">Suggestions</TableHead>
              <TableHead className="pr-5 text-right">Vidéos 12 mois</TableHead>
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
                      {COUNTRIES[c.country].nameFr}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketplace} format={(m) => formatCompact(m.listings)} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketPriceExVatEur} format={(v) => formatMoney(v)} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.taxes} format={(t) => (t.dutyPerUnitEur === null ? "non calculé" : formatMoney(t.dutyPerUnitEur))} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.unitCostEur} format={(v) => formatMoney(v)} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketMarginPct} format={(v) => formatPct(v)} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.marketplace} format={(m) => (m.chinaShare === null ? "—" : formatPct(m.chinaShare * 100))} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <DatumValue datum={s.searchSuggestions} format={(g) => `${g.suggestions.length} (${g.intent.length} achat)`} compact />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <DatumValue datum={s.content} format={(v) => formatCompact(v.videosLast12Months)} compact />
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
