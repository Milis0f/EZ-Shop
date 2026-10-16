import { COUNTRIES, type CountryCode } from "@/domain/country";
import { derived, insufficient, isKnown, type Datum, type Known } from "@/domain/datum";
import { isEuOrigin, originName, type OriginCode } from "@/domain/origin";
import type { DutyBasis, ImportTaxes, TaxRegime } from "@/domain/signals";
import type { FxRates, TariffDuties, VatRate } from "@/providers/contracts";
import { round } from "../stats/normalize";

/**
 * Import duty owed on ONE unit shipped to a consumer of the destination, plus the destination VAT rate.
 * Low-value rules (checked 2026-10-15):
 * - EU: temporary flat duty of €3 per item on consignments under €150, since 2026-07-01 (read from the EU
 *   tariff itself); ad valorem third-country duty above. Import VAT is due from €0 (collected at sale via IOSS).
 *   https://commission.europa.eu/news-and-media/news/ensuring-fairness-and-safety-eur3-customs-duty-low-value-parcels-2026-06-29_en
 * - GB: no customs duty on consignments of £135 or less; VAT is charged at the point of sale.
 *   https://www.gov.uk/guidance/vat-and-overseas-goods-sold-directly-to-customers-in-the-uk
 * - US: no de minimis since 2025-08-29: duty from the first dollar. Chapter 99 additional duties not computed.
 * - AU: no duty on goods of A$1,000 or less; GST collected at sale (low value imported goods).
 *   https://www.ato.gov.au/businesses-and-organisations/international-tax-for-business/gst-for-non-resident-businesses/gst-on-low-value-imported-goods
 * - CH, CA: no open machine-readable tariff: duty reported as unknown.
 */

const EU_LOW_VALUE_EUR = 150;
const GB_LOW_VALUE_GBP = 135;
const AU_LOW_VALUE_AUD = 1000;

export function regimeOf(country: CountryCode): TaxRegime {
  if (COUNTRIES[country].isEU) return "eu";
  if (country === "GB") return "gb";
  if (country === "US") return "us";
  return "other";
}

export interface TaxInputs {
  readonly country: CountryCode;
  readonly origin: OriginCode | undefined;
  /** Tariff of the destination's regime (null for countries without one). */
  readonly duties: Datum<TariffDuties> | null;
  readonly vat: Datum<VatRate>;
  readonly fx: Datum<FxRates>;
  /** Value of one unit for customs, in EUR, and where it comes from. */
  readonly customsValue: { readonly eur: number; readonly label: string; readonly input: Known<unknown> | null } | null;
}

const OTHER_NOTES: Partial<Record<CountryCode, string>> = {
  CH: "Suisse : droits calculés au poids brut, sans tarif ouvert exploitable : non estimés.",
  CA: "Canada : tarif canadien non couvert par une source ouverte : droits non estimés.",
};

export function computeImportTaxes(inputs: TaxInputs): Datum<ImportTaxes> {
  const { country, origin, duties, vat, fx, customsValue } = inputs;
  const regime = regimeOf(country);
  const vatRatePct = isKnown(vat) ? vat.value.standardRatePct : null;
  const notes: string[] = [];
  if (isKnown(vat) && vat.value.note) notes.push(vat.value.note);
  const known: Array<Known<unknown>> = [isKnown(vat) ? vat : null, customsValue?.input ?? null].filter((x): x is Known<unknown> => x !== null);

  if (!origin) {
    return insufficient("Pays d'origine non renseigné : droits de douane non calculables.", ["origin_country"]);
  }

  let dutyRatePct: ImportTaxes["dutyRatePct"] = null;
  let lowValueDutyEur: number | null = null;
  let dutyPerUnitEur: number | null = null;
  let basis: DutyBasis = "unknown";
  const value = customsValue?.eur ?? null;
  if (customsValue) notes.push(`Valeur en douane d'une unité : ${round(customsValue.eur, 2)} € (${customsValue.label}).`);

  if (regime === "eu" && isEuOrigin(origin)) {
    basis = "customs_union";
    dutyPerUnitEur = 0;
    dutyRatePct = { min: 0, max: 0 };
    notes.push(`Origine ${originName(origin)} : marché unique, aucun droit de douane.`);
  } else if (regime === "other") {
    if (country === "AU") {
      const aud = isKnown(fx) ? fx.value.rates.AUD : undefined;
      if (value !== null && aud && value * aud <= AU_LOW_VALUE_AUD) {
        basis = "exempt_low_value";
        dutyPerUnitEur = 0;
        notes.push("Australie : pas de droits sous 1 000 AUD ; la GST est perçue à la vente.");
        if (isKnown(fx)) known.push(fx);
      } else notes.push("Australie : au-delà de 1 000 AUD, droits selon le tarif australien, non couvert.");
    } else notes.push(OTHER_NOTES[country] ?? "Tarif de ce pays non couvert : droits non estimés.");
  } else if (!duties || !isKnown(duties)) {
    notes.push(duties && !isKnown(duties) ? duties.reason : "Tarif indisponible.");
    return insufficient(
      `Droits de douane non calculés : ${duties && !isKnown(duties) ? duties.reason : "code douanier (SH) ou tarif indisponible"}.`,
      duties && !isKnown(duties) ? duties.missing : ["hs_code"],
    );
  } else {
    const d = duties.value;
    known.push(duties);
    dutyRatePct = { min: d.ratePctMin, max: d.ratePctMax };
    lowValueDutyEur = d.lowValueFlatEur;
    notes.push(...d.notes, ...d.otherMeasures.map((m) => `Non calculé : ${m}`));

    if (value === null) {
      notes.push("Valeur de l'unité inconnue (ni prix de vente, ni coût de revient, ni prix AliExpress) : droit par unité non calculé.");
    } else if (regime === "eu" && value < EU_LOW_VALUE_EUR && d.lowValueFlatEur !== null) {
      basis = "low_value_flat";
      dutyPerUnitEur = d.lowValueFlatEur;
      notes.push(`Colis de moins de ${EU_LOW_VALUE_EUR} € : droit forfaitaire de ${d.lowValueFlatEur} € par article (mesure temporaire UE depuis le 1er juillet 2026).`);
    } else if (regime === "gb" && isKnown(fx) && fx.value.rates.GBP && value * fx.value.rates.GBP <= GB_LOW_VALUE_GBP) {
      basis = "exempt_low_value";
      dutyPerUnitEur = 0;
      known.push(fx);
      notes.push(`Envoi de ${GB_LOW_VALUE_GBP} £ ou moins : pas de droit de douane, TVA facturée à la vente.`);
    } else {
      basis = "ad_valorem";
      dutyPerUnitEur = round((value * d.ratePctMax) / 100, 2);
      notes.push(
        d.ratePctMin === d.ratePctMax
          ? `Droit ad valorem de ${d.ratePctMax} % sur la valeur en douane.`
          : `Droit ad valorem au taux le plus élevé de la fourchette (${d.ratePctMin} à ${d.ratePctMax} %), par prudence.`,
      );
      if (regime === "us") notes.push("États-Unis : plus de franchise depuis le 29 août 2025, droits dus dès le premier dollar.");
    }
  }

  return derived<ImportTaxes>(
    {
      regime,
      dutyRatePct,
      lowValueDutyEur,
      vatRatePct,
      dutyPerUnitEur,
      dutyBasis: basis,
      customsValueEur: value === null ? null : round(value, 2),
      notes,
    },
    "money",
    { method: "import_taxes_per_unit_v1", inputs: known, note: "Règles de franchise et de forfait vérifiées le 15 octobre 2026." },
  );
}
