import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { DatumValue } from "@/components/data/datum-value";
import { insufficient, isKnown, type Datum } from "@/domain/datum";
import type { CountrySignalsV2, ImportTaxes, MarketplaceListings, SearchSuggestions } from "@/domain/signals";
import { advancedMessages } from "@/components/data/labels";
import type { Locale } from "@/i18n/config";
import { formatMoney, formatPct } from "@/i18n/format";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import { KPI_GRID, Stat } from "./panels";
import { engineText } from "@/components/data/engine-text";

/** Panels of the data sources v2 on the country page. Every figure keeps its DatumValue marker and tooltip. */


function Notes({ notes, locale }: { notes: readonly string[]; locale: Locale }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5 rounded-tile bg-surface-2/40 px-4 py-3.5 text-xs leading-relaxed text-muted-foreground sm:px-[18px]">
      {notes.map((n) => (
        <li key={n} className="flex gap-2">
          <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
          {engineText(n, locale)}
        </li>
      ))}
    </ul>
  );
}

export function TaxesPanel({ signals, locale }: { signals: CountrySignalsV2; locale: Locale }) {
  const all = advancedMessages(locale);
  const m = all.signals;
  const pct = (v: number) => formatPct(v, locale);
  const { taxes } = signals;
  /** Analyses stored before scoring 2026.10-v3 have no landed cost from the owner's inputs. */
  const landed = signals.landedUnitCostEur ?? insufficient(all.marketTable.notInOldAnalysis);
  const value = isKnown(taxes) ? taxes.value : null;
  return (
    <div>
      <dl className={cn(KPI_GRID, "sm:grid-cols-4")}>
        <Stat label={m.duty} hint={value ? m.dutyBasis[value.dutyBasis] : undefined}>
          <DatumValue
            datum={taxes}
            format={(v: ImportTaxes) =>
              v.dutyRatePct === null ? "—" : v.dutyRatePct.min === v.dutyRatePct.max ? pct(v.dutyRatePct.max) : t(m.range, { min: pct(v.dutyRatePct.min), max: pct(v.dutyRatePct.max) })
            }
          />
        </Stat>
        <Stat label={m.dutyPerUnit} hint={value?.customsValueEur != null ? t(m.dutyPerUnitHint, { value: formatMoney(value.customsValueEur, locale) }) : undefined}>
          <DatumValue datum={taxes} format={(v: ImportTaxes) => (v.dutyPerUnitEur === null ? m.notComputed : <AnimatedNumber value={v.dutyPerUnitEur} format="money" />)} />
        </Stat>
        <Stat label={m.vat} hint={m.vatHint}>
          <DatumValue datum={taxes} format={(v: ImportTaxes) => (v.vatRatePct === null ? m.noVat : pct(v.vatRatePct))} />
        </Stat>
        <Stat label={m.landed} hint={isKnown(landed) && landed.note ? engineText(landed.note, locale) : m.landedHint}>
          <DatumValue datum={landed} format={(v) => <AnimatedNumber value={v} format="money" />} />
        </Stat>
      </dl>
      {value && <Notes notes={value.notes} locale={locale} />}
    </div>
  );
}

export function MarketplacePanel({ signals, locale }: { signals: CountrySignalsV2; locale: Locale }) {
  const m = advancedMessages(locale).signals;
  const { marketplace } = signals;
  return (
    <dl className={cn(KPI_GRID, "sm:grid-cols-3")}>
      <Stat label={m.listings} hint={isKnown(marketplace) ? t(m.listingsHint, { site: marketplace.value.marketplaceId.replace("EBAY_", "eBay ") }) : undefined}>
        <DatumValue datum={marketplace} format={(m) => <AnimatedNumber value={m.listings} format="int" />} />
      </Stat>
      <Stat label={m.prices} hint={m.pricesHint}>
        <DatumValue datum={marketplace} format={(v) => <ObservedPrices prices={v.observedPrices ?? []} locale={locale} />} />
      </Stat>
      <Stat label={m.china} hint={m.chinaHint}>
        <DatumValue datum={marketplace} format={(v) => (v.chinaShare === null ? m.unknown : formatPct(v.chinaShare * 100, locale))} />
      </Stat>
    </dl>
  );
}

const MAX_OBSERVED_PRICES = 5;

function ObservedPrices({ prices, locale }: { prices: NonNullable<MarketplaceListings["observedPrices"]>; locale: Locale }) {
  if (prices.length === 0) return <span className="text-muted-foreground">{advancedMessages(locale).signals.noPrices}</span>;
  return (
    <span className="mt-0.5 flex flex-wrap gap-1.5">
      {prices.slice(0, MAX_OBSERVED_PRICES).map((p, i) => (
        <span key={`${i}-${p.value}`} className="tabular rounded-pill border border-line px-2.5 py-0.5 text-sm">
          {formatMoney(p.value, locale, p.currency)}
        </span>
      ))}
    </span>
  );
}

function SuggestionList({ suggestions, locale }: { suggestions: SearchSuggestions; locale: Locale }) {
  if (suggestions.suggestions.length === 0) return <p className="text-sm text-muted-foreground">{advancedMessages(locale).signals.noSuggestions}</p>;
  const intent = new Set(suggestions.intent);
  const shops = new Set(suggestions.marketplaces);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {suggestions.suggestions.map((s) => (
        <li
          key={s}
          className={cn(
            "rounded-pill border px-3 py-1 text-xs",
            intent.has(s)
              ? "border-foreground bg-foreground font-medium text-primary-foreground"
              : shops.has(s)
                ? "border-foreground/50 text-foreground"
                : "border-line text-muted-foreground",
          )}
        >
          {s}
        </li>
      ))}
    </ul>
  );
}

export function InterestPanel({ signals, locale }: { signals: CountrySignalsV2; locale: Locale }) {
  const m = advancedMessages(locale).signals;
  const { searchSuggestions, content } = signals;
  return (
    <div className="panel grid min-w-0 gap-8 p-5 sm:p-[26px] min-[900px]:grid-cols-[minmax(0,1fr)_20rem] min-[900px]:gap-12">
      <div>
        <h3 className="text-sm font-medium">{m.related}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {m.relatedHelp} <span className="text-foreground">{m.filled}</span>
          {m.filledMeaning} <span className="text-foreground">{m.outlined}</span>
          {m.outlinedMeaning}
        </p>
        <div className="mt-4">
          {isKnown(searchSuggestions) ? <SuggestionList suggestions={searchSuggestions.value} locale={locale} /> : <DatumValue datum={searchSuggestions} format={() => null} />}
        </div>
      </div>
      <dl className="grid content-start gap-6 min-[900px]:border-l min-[900px]:border-line min-[900px]:pl-10">
        <Stat label={m.youtube} hint={m.youtubeHint}>
          <DatumValue datum={content} format={(c) => <AnimatedNumber value={c.videosLast12Months} format="compact" />} />
        </Stat>
        <Stat label={m.recent}>
          <DatumValue datum={content} format={(c) => (c.recentShare === null ? "—" : formatPct(c.recentShare * 100, locale))} />
        </Stat>
      </dl>
    </div>
  );
}

/** Compact cell for the comparison table of the analysis page. */
export function SignalCell<T>({ datum, children }: { datum: Datum<T>; children: (v: T) => ReactNode }) {
  return <DatumValue datum={datum} format={children} compact />;
}

