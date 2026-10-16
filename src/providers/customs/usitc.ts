import { z } from "zod";
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

/**
 * USITC Harmonized Tariff Schedule REST search — open, no key. Verified live on 2026-10-15.
 * Gives the general (MFN), special (FTA partners) and column 2 rates of the US tariff lines under an HS6 code.
 * Chapter 99 additional duties (section 301, other origin-specific measures) are only flagged, never computed.
 */

const BASE_URL = "https://hts.usitc.gov/reststop/search";
const CACHE_TTL_SECONDS = 30 * 24 * 3600;
/** Column 2 applies to these origins only. */
const COLUMN_2_ORIGINS = new Set(["CU", "KP", "RU", "BY"]);

export const usitcMeta: ProviderMeta = {
  id: "usitc-hts",
  name: "Tarif douanier des États-Unis (USITC HTS)",
  category: "customs",
  authMode: "none",
  access: "open",
  docsUrl: "https://hts.usitc.gov/",
  qualityTier: 0.85,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "list", countries: ["US"], note: "États-Unis uniquement." },
  verification: "live_verified",
  notes: [
    "Droits à l'import aux États-Unis par code SH : taux général, préférences des accords et colonne 2.",
    "Les droits additionnels du chapitre 99 (section 301, mesures par origine) sont signalés mais pas calculés.",
  ],
};

const rowSchema = z.object({
  htsno: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  general: z.string().nullable().optional(),
  special: z.string().nullable().optional(),
  other: z.string().nullable().optional(),
  footnotes: z.array(z.object({ value: z.string().nullable().optional() }).passthrough()).nullable().optional(),
});

const rowsSchema = z.array(rowSchema);

/** The search answered with a list of rows (possibly empty), not an error object: safe to cache. */
export function isUsitcPayload(payload: unknown): boolean {
  return rowsSchema.safeParse(payload).success;
}

/** "Free" → 0, "13.5%" → 13.5; compound or specific rates (¢/kg…) → null. */
export function parseUsRate(rate: string | null | undefined): number | null {
  if (!rate) return null;
  const r = rate.trim();
  if (/^free\b/i.test(r)) return 0;
  const m = /^([\d.]+)%$/.exec(r);
  return m ? Number(m[1]) : null;
}

/** Special column: "Free (AU,BH,CL,…)" → rate when the origin is listed. */
export function specialRateFor(special: string | null | undefined, origin: string): number | null {
  if (!special) return null;
  for (const part of special.split(/\)\s*,?\s*/)) {
    const m = /^\s*(.+?)\s*\(([^)]*)$/.exec(part);
    if (m && m[2].split(/[,\s]+/).includes(origin)) return parseUsRate(m[1]);
  }
  return null;
}

export interface UsLine {
  readonly code: string;
  readonly ratePct: number | null;
  readonly raw: string;
  readonly chapter99: readonly string[];
}

export function parseUsLines(payload: unknown, hs6: string, origin: string): UsLine[] {
  const parsed = rowsSchema.safeParse(payload);
  if (!parsed.success) return [];
  return parsed.data.flatMap((row) => {
    const code = (row.htsno ?? "").replace(/\D/g, "");
    if (!code.startsWith(hs6) || code.length < 8 || !row.general) return [];
    const general = parseUsRate(row.general);
    const column2 = COLUMN_2_ORIGINS.has(origin) ? parseUsRate(row.other) : null;
    const special = specialRateFor(row.special, origin);
    const rate = column2 ?? (special !== null && general !== null ? Math.min(special, general) : general);
    const chapter99 = (row.footnotes ?? []).flatMap((f) => (f.value && /99\d\d\./.test(f.value) ? [f.value.trim()] : []));
    return [{ code, ratePct: rate, raw: row.general, chapter99 }];
  });
}

export class UsitcProvider implements TariffProvider {
  readonly meta = usitcMeta;
  readonly regimes: readonly TariffRegime[] = ["us"];

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: "API ouverte, sans clé." };
  }

  async classify(): Promise<ProviderResult<readonly ClassificationCandidate[]>> {
    return fail("not_implemented", "USITC : la classification passe par le tarif UK (code SH harmonisé)");
  }

  async getDuties(regime: TariffRegime, code: string, origin: string): Promise<ProviderResult<TariffDuties>> {
    if (regime !== "us") return fail("not_implemented", "USITC : seul le tarif des États-Unis est couvert");
    // 4 to 6 harmonised digits: the same at the border of every country. Deeper digits are national.
    const hs6 = code.replace(/\D/g, "").slice(0, 6);
    if (hs6.length < 4) return fail("no_data", "USITC : un code SH d'au moins 4 chiffres est nécessaire");
    const keyword = hs6.length === 6 ? `${hs6.slice(0, 4)}.${hs6.slice(4, 6)}` : hs6.slice(0, 4);

    const url = `${BASE_URL}?keyword=${keyword}`;
    const raw = await cached(
      this.cache,
      cacheKey(this.meta.id, url),
      this.meta.id,
      CACHE_TTL_SECONDS,
      () => httpJson(url, "USITC HTS search", { timeoutMs: this.timeoutMs }),
      isUsitcPayload,
    );
    if (!raw.ok) return raw;
    const lines = parseUsLines(raw.data, hs6, origin);
    const rates = lines.flatMap((l) => (l.ratePct === null ? [] : [l.ratePct]));
    if (rates.length === 0) return fail("no_data", `USITC : aucun taux ad valorem sous ${keyword}`);

    const specific = lines.filter((l) => l.ratePct === null).map((l) => `Droit non ad valorem sur ${l.code} : ${l.raw}`);
    const chapter99 = [...new Set(lines.flatMap((l) => l.chapter99))].map((f) => `Mesure du chapitre 99 citée : ${f}`);
    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `hts/${hs6}/origin/${origin}`,
      sourceUrl: `https://hts.usitc.gov/search?query=${keyword}`,
    };
    return ok({
      regime: "us",
      code: hs6,
      ratePctMin: Math.min(...rates),
      ratePctMax: Math.max(...rates),
      lowValueFlatEur: null,
      otherMeasures: [...specific, ...chapter99],
      notes: [
        `${lines.length} ligne${lines.length > 1 ? "s" : ""} du tarif américain sous ${keyword}${hs6.length < 6 ? ` commençant par ${hs6}` : ""}.`,
        "Droits additionnels liés à l'origine (section 301, autres mesures du chapitre 99) non inclus : à vérifier sur le tarif à jour.",
      ],
      source,
    });
  }
}
