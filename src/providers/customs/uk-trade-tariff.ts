import type { SourceRef } from "@/domain/provenance";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type ClassificationCandidate,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type TariffDuties,
  type TariffProvider,
  type TariffRegime,
} from "../contracts";
import { cacheKey, cached, httpJson } from "../http";
import { parseApplicableMeasures, parseHeadingLeaves, parseNodeDescription, parseSearch } from "./uk-tariff-parse";

/**
 * GOV.UK Trade Tariff API — open, no key (rate limited since 2026-09; a key raises the limit).
 * - /uk/api: the GB tariff (imports into Great Britain).
 * - /xi/api: the Northern Ireland tariff, which applies the EU Common Customs Tariff — used here as the
 *   official, machine-readable source of EU duties, including the temporary €3 low-value consignment duty.
 * Verified live on 2026-10-15.
 */

const BASE_URL = "https://www.trade-tariff.service.gov.uk";
const CACHE_TTL_SECONDS = 30 * 24 * 3600;
/** Enough lines to bound the duty range of a group without spending the rate limit. */
const MAX_LINES = 10;

const PATH: Record<Exclude<TariffRegime, "us">, string> = { gb: "uk", eu: "xi" };
const STOPWORDS = new Set(["with", "for", "and", "the", "set", "pack", "mini", "portable", "electric", "smart", "new"]);

export const ukTradeTariffMeta: ProviderMeta = {
  id: "uk-trade-tariff",
  name: "Tarif douanier UK et UE (Trade Tariff)",
  category: "customs",
  authMode: "none",
  access: "open",
  docsUrl: "https://api.trade-tariff.service.gov.uk/",
  qualityTier: 0.9,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: [
    "Classement douanier (code SH) et droits à l'import pour le Royaume-Uni et l'Union européenne, selon le pays d'origine.",
    "Inclut la taxe UE temporaire de 3 € par article sur les colis de moins de 150 € (depuis le 1er juillet 2026).",
  ],
};

const digits = (code: string): string => code.replace(/\D/g, "");

/** Longest common prefix of commodity codes (at least the 4-digit heading). */
export function commonPrefix(codes: readonly string[]): string {
  if (codes.length === 0) return "";
  let prefix = codes[0];
  for (const code of codes) while (!code.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.length >= 4 ? prefix : codes[0].slice(0, 4);
}

/** English words to try, the whole description first. */
function searchQueries(description: string): string[] {
  const words = description
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set([description.trim().toLowerCase(), ...words.toReversed()])].slice(0, 4);
}

export class UkTradeTariffProvider implements TariffProvider {
  readonly meta = ukTradeTariffMeta;
  readonly regimes: readonly TariffRegime[] = ["gb", "eu"];

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  private get(path: string, label: string): Promise<ProviderResult<unknown>> {
    const url = `${BASE_URL}${path}`;
    return cached(this.cache, cacheKey(this.meta.id, url), this.meta.id, CACHE_TTL_SECONDS, () =>
      httpJson(url, label, { timeoutMs: this.timeoutMs, headers: { Accept: "application/json" } }),
    );
  }

  /** Searches the GB tariff with the English description, then its words, and keeps the first match. */
  async classify(description: string): Promise<ProviderResult<readonly ClassificationCandidate[]>> {
    for (const q of searchQueries(description)) {
      const raw = await this.get(`/uk/api/search?q=${encodeURIComponent(q)}`, "Trade Tariff search");
      if (!raw.ok) return raw;
      const hit = parseSearch(raw.data);
      if (hit.kind === "none") continue;

      const endpoint = hit.kind === "exact" ? hit.endpoint : "commodities";
      const id = hit.kind === "exact" ? hit.id : hit.codes[0];
      const node = await this.get(`/uk/api/${endpoint}/${id}`, "Trade Tariff node");
      const label = node.ok ? parseNodeDescription(node.data) : null;
      // A match can be a group of lines ("Other": wool, cotton, synthetic…): keep the prefix they share,
      // so duties are given as the range over the whole group instead of one arbitrary line.
      const leaves = endpoint !== "commodities" && node.ok ? parseHeadingLeaves(node.data, digits(id).slice(0, 4)) : [];
      const code = endpoint === "commodities" ? digits(id) : leaves.length > 0 ? commonPrefix(leaves.map((l) => l.code)) : digits(id).slice(0, 4);
      return ok([{ code, description: label ? `${label} (trouvé pour « ${q} »)` : `Trouvé pour « ${q} »` }]);
    }
    return fail("no_data", "Trade Tariff : aucun code trouvé pour cette description");
  }

  async getDuties(regime: TariffRegime, code: string, origin: string): Promise<ProviderResult<TariffDuties>> {
    if (regime === "us") return fail("not_implemented", "Trade Tariff : tarif des États-Unis non couvert");
    const prefix = digits(code);
    if (prefix.length < 4) return fail("no_data", "Trade Tariff : code trop court");
    const path = PATH[regime];

    const heading = await this.get(`/${path}/api/headings/${prefix.slice(0, 4)}`, `Trade Tariff ${path} heading`);
    if (!heading.ok) return heading;
    const allLines = parseHeadingLeaves(heading.data, prefix.slice(0, Math.min(prefix.length, 10)));
    const lines = allLines.slice(0, MAX_LINES);
    if (lines.length === 0) return fail("no_data", `Trade Tariff : aucune ligne tarifaire sous ${prefix}`);

    const measures = await Promise.all(
      lines.map(async (line) => {
        const raw = await this.get(`/${path}/api/commodities/${line.code}`, `Trade Tariff ${path} commodity`);
        return raw.ok ? parseApplicableMeasures(raw.data, origin) : null;
      }),
    );
    const known = measures.filter((m): m is NonNullable<typeof m> => m !== null);
    if (known.length === 0) return fail("upstream_error", "Trade Tariff : mesures indisponibles");

    const rates = known.flatMap((m) => {
      const base = m.thirdCountryPct;
      const best = m.preferencePct !== null && (base === null || m.preferencePct < base) ? m.preferencePct : base;
      return best === null ? [] : [best];
    });
    if (rates.length === 0) return fail("no_data", "Trade Tariff : aucun droit ad valorem pour cette origine");

    const notes = [
      lines.length > 1
        ? `${allLines.length} lignes tarifaires sous ${prefix} (selon la matière ou le type) : fourchette de leurs droits${allLines.length > lines.length ? `, sur les ${lines.length} premières` : ""}.`
        : `Ligne ${lines[0].code} : ${lines[0].description}.`,
      ...(known.some((m) => m.preferencePct !== null && (m.thirdCountryPct === null || m.preferencePct < m.thirdCountryPct))
        ? ["Taux préférentiel retenu : il exige une preuve d'origine."]
        : []),
    ];
    const lowValue = known.map((m) => m.lowValueFlat).find((v) => v !== null) ?? null;
    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `${path}/headings/${prefix.slice(0, 4)}/origin/${origin}`,
      sourceUrl: `${BASE_URL}/${path === "uk" ? "" : "xi/"}headings/${prefix.slice(0, 4)}`,
    };
    return ok({
      regime,
      code: prefix,
      ratePctMin: Math.min(...rates),
      ratePctMax: Math.max(...rates),
      lowValueFlatEur: regime === "eu" ? lowValue : null,
      otherMeasures: [...new Set(known.flatMap((m) => m.other))],
      notes,
      source,
    });
  }
}
