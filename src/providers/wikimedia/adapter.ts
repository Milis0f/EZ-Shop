import { z } from "zod";
import type { LanguageCode } from "@/domain/country";
import type { MonthlyPoint } from "@/domain/market";
import type { SourceRef } from "@/domain/provenance";
import { parseYearMonth, type YearMonth } from "@/domain/time";
import type { ProviderCacheRepository } from "@/server/repositories/types";
import {
  fail,
  ok,
  type ProviderMeta,
  type ProviderResult,
  type ProviderStatus,
  type TopicEntity,
  type TopicInterestObservation,
  type TopicInterestProvider,
  type TopicInterestQuery,
} from "../contracts";
import { cacheKey, cached, createLimiter, httpJson, USER_AGENT } from "../http";

/**
 * Wikipedia pageviews (Wikimedia REST API) for the article matching the product, per language edition.
 * Open, no key. Verified live on 2026-10-15. Pageviews are per language edition, never per country:
 * the engine uses them only as the shape of interest in a category.
 */

const CACHE_TTL_SECONDS = 7 * 24 * 3600;
const MAX_LOOKUPS = 6;
/** Languages whose noun usually comes first ("chaussettes chauffantes"); others put it last ("heated socks"). */
const NOUN_FIRST: ReadonlySet<LanguageCode> = new Set(["fr", "es", "it", "pt"]);
/** A phrase cut on one of these words is not a title ("lampe de", "lamp for"). */
const LINK_WORDS = new Set(["de", "du", "des", "la", "le", "les", "à", "a", "au", "en", "pour", "avec", "et", "di", "da", "del", "della", "per", "con", "y", "para", "do", "da", "em", "von", "mit", "für", "und", "for", "with", "of", "the", "and", "van", "met", "voor"]);

export const wikimediaMeta: ProviderMeta = {
  id: "wikimedia",
  name: "Wikipédia — audiences des articles",
  category: "search_signals",
  authMode: "none",
  access: "open",
  docsUrl: "https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html",
  qualityTier: 0.35,
  connectorVersion: "1.0.0",
  requiredEnv: [],
  coverage: { kind: "all" },
  verification: "live_verified",
  notes: [
    "Lectures mensuelles de l'article le plus proche du produit (souvent la catégorie : « Chaussette »), par langue.",
    "Donne la forme de l'intérêt (tendance, saisonnalité), jamais un volume, et par langue, pas par pays.",
  ],
};

/**
 * Candidate titles, most specific first: the full term, then shorter phrases keeping the head noun
 * ("lampe de bureau led" → "lampe de bureau"; "led desk lamp" → "desk lamp"), then single words.
 */
export function titleCandidates(terms: readonly string[], language: LanguageCode): string[] {
  const out: string[] = [];
  const nounFirst = NOUN_FIRST.has(language);
  for (const term of terms) {
    const all = term.split(/\s+/).filter(Boolean);
    for (let n = all.length; n >= 2; n -= 1) {
      const phrase = nounFirst ? all.slice(0, n) : all.slice(all.length - n);
      const edge = (nounFirst ? phrase.at(-1) : phrase[0]) ?? "";
      if (!LINK_WORDS.has(edge.toLowerCase())) out.push(phrase.join(" "));
    }
    // A single word only when it is the head noun ("chaussettes", "Socken"): a lone adjective
    // ("isotherme", "chauffantes") would match an unrelated article.
    const head = nounFirst ? all[0] : all.at(-1);
    if (head && head.length >= 3 && !LINK_WORDS.has(head.toLowerCase())) out.push(head);
  }
  const capitalised = out.map((t) => t.charAt(0).toLocaleUpperCase(language) + t.slice(1));
  return [...new Set(capitalised)].slice(0, MAX_LOOKUPS);
}

const batchSchema = z.object({
  query: z
    .object({
      normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      redirects: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      pages: z.record(
        z.string(),
        z.object({
          title: z.string(),
          missing: z.unknown().optional(),
          pageprops: z.object({ wikibase_item: z.string().optional(), disambiguation: z.unknown().optional() }).optional(),
        }),
      ),
    })
    .optional(),
});

/** One request for every candidate: follows normalisation and redirects, keeps the first real article in candidate order. */
export function parseTitleBatch(payload: unknown, candidates: readonly string[]): { title: string; wikidataId: string } | null {
  const parsed = batchSchema.safeParse(payload);
  const query = parsed.success ? parsed.data.query : undefined;
  if (!query) return null;
  const normalized = new Map((query.normalized ?? []).map((n) => [n.from, n.to]));
  const redirects = new Map((query.redirects ?? []).map((r) => [r.from, r.to]));
  const byTitle = new Map(Object.values(query.pages).map((p) => [p.title, p]));
  for (const candidate of candidates) {
    const n = normalized.get(candidate) ?? candidate;
    const page = byTitle.get(redirects.get(n) ?? n);
    if (!page || page.missing !== undefined || page.pageprops?.disambiguation !== undefined || !page.pageprops?.wikibase_item) continue;
    return { title: page.title, wikidataId: page.pageprops.wikibase_item };
  }
  return null;
}

const pagesSchema = z.object({
  query: z
    .object({
      pages: z.record(
        z.string(),
        z.object({
          title: z.string(),
          missing: z.unknown().optional(),
          pageprops: z.object({ wikibase_item: z.string().optional(), disambiguation: z.unknown().optional() }).optional(),
        }),
      ),
    })
    .optional(),
});

export function parseTitleLookup(payload: unknown): { title: string; wikidataId: string } | null {
  const parsed = pagesSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.query) return null;
  for (const page of Object.values(parsed.data.query.pages)) {
    if (page.missing !== undefined || page.pageprops?.disambiguation !== undefined) continue;
    if (page.pageprops?.wikibase_item) return { title: page.title, wikidataId: page.pageprops.wikibase_item };
  }
  return null;
}

const viewsSchema = z.object({ items: z.array(z.object({ timestamp: z.string(), views: z.number() })) });

export function parsePageviews(payload: unknown): ProviderResult<MonthlyPoint[]> {
  const parsed = viewsSchema.safeParse(payload);
  if (!parsed.success) return fail("invalid_response", "Wikimedia pageviews: unexpected response shape");
  return ok(parsed.data.items.map((i) => ({ month: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}` as YearMonth, value: i.views })));
}

export function parseSitelink(payload: unknown, id: string, site: string): string | null {
  const parsed = z
    .object({ entities: z.record(z.string(), z.object({ sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional() })) })
    .safeParse(payload);
  return parsed.success ? (parsed.data.entities[id]?.sitelinks?.[site]?.title ?? null) : null;
}

export function parseEnglishLabel(payload: unknown, id: string): string | null {
  const parsed = z
    .object({ entities: z.record(z.string(), z.object({ labels: z.object({ en: z.object({ value: z.string() }).optional() }).optional() })) })
    .safeParse(payload);
  return parsed.success ? (parsed.data.entities[id]?.labels?.en?.value ?? null) : null;
}

const lastDay = (ym: YearMonth): string => {
  const { year, month } = parseYearMonth(ym);
  return `${year}${String(month).padStart(2, "0")}${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * Wikimedia rules (2026): at most 3 concurrent requests; 10 requests/min without a contact in the
 * User-Agent, 200 with one; after a 429, wait (Retry-After, at least 5 s) instead of retrying.
 * https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
 */
const limit = createLimiter(3);
const COOLDOWN_MS = 60_000;
/** Shared by every analysis in the process: once refused, Wikipedia is skipped until the cooldown ends. */
let blockedUntil = 0;

export class WikimediaProvider implements TopicInterestProvider {
  readonly meta = wikimediaMeta;

  /** Cached, throttled GET; a 429 pauses Wikipedia for the cooldown instead of being retried. */
  private get(url: string, label: string): Promise<ProviderResult<unknown>> {
    return cached(this.cache, cacheKey(this.meta.id, url), this.meta.id, CACHE_TTL_SECONDS, () =>
      limit(async () => {
        if (Date.now() < blockedUntil) return fail("rate_limited", this.limitMessage(), true);
        const result = await httpJson(url, label, { timeoutMs: this.timeoutMs, attempts: 1, headers: { "User-Agent": this.userAgent } });
        if (!result.ok && result.error.code === "rate_limited") {
          blockedUntil = Date.now() + COOLDOWN_MS;
          return fail("rate_limited", this.limitMessage(), true);
        }
        return result;
      }),
    );
  }

  private get userAgent(): string {
    return this.contact ? `EZ-Shop/0.1 (${this.contact}) pre-launch product research` : USER_AGENT;
  }

  private limitMessage(): string {
    return this.contact
      ? "Wikipédia : limite de requêtes atteinte, réessaie dans une minute"
      : "Wikipédia limite les requêtes sans contact à 10 par minute : ajoute un contact dans Sources de données pour passer à 200";
  }

  constructor(
    private readonly cache: ProviderCacheRepository,
    private readonly timeoutMs: number,
    /** Email or URL put in the User-Agent, as Wikimedia asks; raises its limit from 10 to 200 requests/min. */
    private readonly contact?: string,
  ) {}

  status(): ProviderStatus {
    return { state: "ready", detail: this.contact ? "API ouverte, contact renseigné (200 requêtes/min)." : "API ouverte, sans contact : 10 requêtes/min." };
  }

  async getTopicInterest(query: TopicInterestQuery): Promise<ProviderResult<TopicInterestObservation>> {
    const viaConcept = query.wikidataId ? await this.sitelink(query.wikidataId, query.language) : null;
    const article = viaConcept ?? (await this.resolveArticle(query.terms, query.language));
    if (!article) return fail("no_data", `Wikipédia (${query.language}) : aucun article correspondant aux termes`);

    const slug = encodeURIComponent(article.title.replaceAll(" ", "_"));
    const url =
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${query.language}.wikipedia/all-access/user/${slug}` +
      `/monthly/${query.from.replace("-", "")}01/${lastDay(query.to)}`;
    const raw = await this.get(url, "Wikimedia pageviews");
    if (!raw.ok) return raw;
    const points = parsePageviews(raw.data);
    if (!points.ok) return points;

    const source: SourceRef = {
      sourceId: this.meta.id,
      origin: "live",
      collectedAt: new Date().toISOString(),
      connectorVersion: this.meta.connectorVersion,
      queryRef: `pageviews/${query.language}/${article.title}`,
      sourceUrl: `https://${query.language}.wikipedia.org/wiki/${slug}`,
      period: { start: query.from, end: query.to },
    };
    return ok({ language: query.language, article: article.title, wikidataId: article.wikidataId, points: points.data, source });
  }

  async resolveEntity(terms: readonly string[], language: LanguageCode): Promise<ProviderResult<TopicEntity>> {
    const article = await this.resolveArticle(terms, language);
    if (!article) return fail("no_data", `Wikipédia (${language}) : aucun article correspondant aux termes`);
    const raw = await this.entity(article.wikidataId);
    return ok({ wikidataId: article.wikidataId, article: article.title, englishLabel: raw.ok ? parseEnglishLabel(raw.data, article.wikidataId) : null });
  }

  private entity(id: string): Promise<ProviderResult<unknown>> {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|sitelinks&languages=en&ids=${id}`;
    return this.get(url, "Wikidata entity");
  }

  /** Title of the concept's article in a language edition, from Wikidata sitelinks. */
  private async sitelink(id: string, language: LanguageCode): Promise<{ title: string; wikidataId: string } | null> {
    const raw = await this.entity(id);
    const title = raw.ok ? parseSitelink(raw.data, id, `${language}wiki`) : null;
    return title ? { title, wikidataId: id } : null;
  }

  /** Exact title lookups (redirects followed): no full-text guessing, so the article really is the topic. */
  private async resolveArticle(terms: readonly string[], language: LanguageCode): Promise<{ title: string; wikidataId: string } | null> {
    const candidates = titleCandidates(terms, language);
    if (candidates.length === 0) return null;
    const url =
      `https://${language}.wikipedia.org/w/api.php?action=query&format=json&redirects=1` +
      `&prop=pageprops&ppprop=wikibase_item|disambiguation&titles=${encodeURIComponent(candidates.join("|"))}`;
    const raw = await this.get(url, "Wikipedia title lookup");
    return raw.ok ? parseTitleBatch(raw.data, candidates) : null;
  }
}
