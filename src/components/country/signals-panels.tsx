import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { DatumValue } from "@/components/data/datum-value";
import { isKnown, type Datum } from "@/domain/datum";
import type { CountrySignalsV2, DutyBasis, ImportTaxes, SearchSuggestions } from "@/domain/signals";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KPI_GRID, Stat } from "./panels";

/** Panels of the data sources v2 on the country page. Every figure keeps its DatumValue marker and tooltip. */

const DUTY_BASIS_LABELS: Record<DutyBasis, string> = {
  ad_valorem: "Droit ad valorem",
  low_value_flat: "Forfait petits colis (UE)",
  exempt_low_value: "Franchise petits envois",
  customs_union: "Marché unique, sans droit",
  unknown: "Non calculé",
};

const pct = (v: number) => formatPct(v);

function Notes({ notes }: { notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs leading-relaxed text-muted-foreground">
      {notes.map((n) => (
        <li key={n} className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
          {n}
        </li>
      ))}
    </ul>
  );
}

export function TaxesPanel({ signals }: { signals: CountrySignalsV2 }) {
  const { taxes, unitCostEur } = signals;
  const value = isKnown(taxes) ? taxes.value : null;
  return (
    <div>
      <dl className={cn(KPI_GRID, "sm:grid-cols-4")}>
        <Stat label="Droit de douane" hint={value ? DUTY_BASIS_LABELS[value.dutyBasis] : undefined}>
          <DatumValue
            datum={taxes}
            format={(t: ImportTaxes) =>
              t.dutyRatePct === null ? "—" : t.dutyRatePct.min === t.dutyRatePct.max ? pct(t.dutyRatePct.max) : `${pct(t.dutyRatePct.min)} à ${pct(t.dutyRatePct.max)}`
            }
          />
        </Stat>
        <Stat label="Droit par unité" hint={value?.customsValueEur != null ? `Sur ${formatMoney(value.customsValueEur)} de valeur en douane` : undefined}>
          <DatumValue datum={taxes} format={(t: ImportTaxes) => (t.dutyPerUnitEur === null ? "non calculé" : <AnimatedNumber value={t.dutyPerUnitEur} format="money" />)} />
        </Stat>
        <Stat label="TVA du pays" hint="Payée par l'acheteur, hors de ta marge si tes prix sont HT">
          <DatumValue datum={taxes} format={(t: ImportTaxes) => (t.vatRatePct === null ? "pas de TVA nationale" : pct(t.vatRatePct))} />
        </Stat>
        <Stat label="Coût unitaire rendu" hint="Achat + droits, avant livraison et publicité">
          <DatumValue datum={unitCostEur} format={(v) => <AnimatedNumber value={v} format="money" />} />
        </Stat>
      </dl>
      {value && <Notes notes={value.notes} />}
    </div>
  );
}

export function MarketplacePanel({ signals }: { signals: CountrySignalsV2 }) {
  const { marketplace, marketPriceExVatEur, marketMarginPct } = signals;
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3 lg:grid-cols-5")}>
      <Stat label="Annonces eBay" hint={isKnown(marketplace) ? marketplace.value.marketplaceId.replace("EBAY_", "eBay ") : undefined}>
        <DatumValue datum={marketplace} format={(m) => <AnimatedNumber value={m.listings} format="int" />} />
      </Stat>
      <Stat label="Prix affichés (TTC)" hint="Quartiles des annonces, en euros">
        <DatumValue
          datum={marketplace}
          format={(m) => (m.priceEur ? `${formatMoney(m.priceEur.p25)} à ${formatMoney(m.priceEur.p75)}` : "trop peu de prix")}
        />
      </Stat>
      <Stat label="Prix médian HT">
        <DatumValue datum={marketPriceExVatEur} format={(v) => <AnimatedNumber value={v} format="money" />} />
      </Stat>
      <Stat label="Marge au prix du marché" hint="Avant publicité et livraison">
        <DatumValue datum={marketMarginPct} format={(v) => <AnimatedNumber value={v} format="percent" />} />
      </Stat>
      <Stat label="Vendeurs basés en Chine" hint="Part des annonces : concurrence dropshipping">
        <DatumValue datum={marketplace} format={(m) => (m.chinaShare === null ? "inconnu" : formatPct(m.chinaShare * 100))} />
      </Stat>
    </dl>
  );
}

function SuggestionList({ suggestions }: { suggestions: SearchSuggestions }) {
  if (suggestions.suggestions.length === 0) return <p className="text-sm text-muted-foreground">Aucune suggestion : peu de recherches sur ces termes dans ce pays.</p>;
  const intent = new Set(suggestions.intent);
  const shops = new Set(suggestions.marketplaces);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {suggestions.suggestions.map((s) => (
        <li
          key={s}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            intent.has(s) ? "border-decision-prioritize/40 text-foreground" : shops.has(s) ? "border-foreground/50 text-foreground" : "border-line text-muted-foreground",
          )}
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

export function InterestPanel({ signals }: { signals: CountrySignalsV2 }) {
  const { searchSuggestions, content } = signals;
  return (
    <div className="panel grid gap-10 p-6 lg:grid-cols-[1fr_20rem] lg:gap-12">
      <div>
        <h3 className="text-sm font-medium">Recherches associées</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Suggestions Google du pays. <span className="text-foreground">Contour vert</span> : intention d&apos;achat.{" "}
          <span className="text-foreground">Contour clair</span> : marketplace ou enseigne citée.
        </p>
        <div className="mt-4">
          {isKnown(searchSuggestions) ? <SuggestionList suggestions={searchSuggestions.value} /> : <DatumValue datum={searchSuggestions} format={() => null} />}
        </div>
      </div>
      <dl className="grid content-start gap-6 lg:border-l lg:border-line lg:pl-10">
        <Stat label="Vidéos YouTube sur 12 mois" hint="Estimation de YouTube, approximative">
          <DatumValue datum={content} format={(c) => <AnimatedNumber value={c.videosLast12Months} format="compact" />} />
        </Stat>
        <Stat label="Vues médianes des plus pertinentes">
          <DatumValue datum={content} format={(c) => (c.medianViews === null ? "—" : <AnimatedNumber value={c.medianViews} format="compact" />)} />
        </Stat>
        <Stat label="Publiées dans les 90 derniers jours">
          <DatumValue datum={content} format={(c) => (c.recentShare === null ? "—" : formatPct(c.recentShare * 100))} />
        </Stat>
      </dl>
    </div>
  );
}

/** Compact cell for the comparison table of the analysis page. */
export function SignalCell<T>({ datum, children }: { datum: Datum<T>; children: (v: T) => ReactNode }) {
  return <DatumValue datum={datum} format={children} compact />;
}

