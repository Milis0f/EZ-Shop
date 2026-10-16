import { insufficient, type Datum } from "@/domain/datum";
import type { MarketContext } from "@/domain/market";
import type { MacroIndicatorId } from "@/providers/contracts";

export type MacroSignals = Partial<Record<MacroIndicatorId, Datum<number>>>;

const SOURCE_OF: Record<MacroIndicatorId, string> = {
  population: "world-bank",
  gdp_per_capita_ppp: "world-bank",
  internet_users_pct: "world-bank",
  online_buyers_pct: "eurostat",
  consumer_confidence: "oecd",
};

const pick = (signals: MacroSignals, id: MacroIndicatorId, label: string): Datum<number> =>
  signals[id] ?? insufficient(`${label} : non disponible pour ce pays.`, [SOURCE_OF[id]]);

export function buildMarketContext(signals: MacroSignals): MarketContext {
  return {
    population: pick(signals, "population", "Population"),
    gdpPerCapitaPpp: pick(signals, "gdp_per_capita_ppp", "PIB par habitant PPA"),
    internetUsersPct: pick(signals, "internet_users_pct", "Part d'internautes"),
    onlineBuyersPct: pick(signals, "online_buyers_pct", "Part d'acheteurs en ligne"),
    consumerConfidence: pick(signals, "consumer_confidence", "Confiance des consommateurs"),
  };
}
