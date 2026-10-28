/**
 * Offline recognition of supplier product URLs (AliExpress, Temu, Alibaba.com, 1688).
 *
 * Pure string parsing: nothing is ever fetched. Supplier sites forbid automated collection, so a short or
 * share link (whose target is only known by following it) is refused with guidance instead of resolved.
 */

export type SupplierPlatform = "aliexpress" | "temu" | "alibaba" | "1688";

/** Why an address is refused: views translate this code (home messages, `supplier.*`). */
export type SupplierUrlIssue = "malformed" | "not_web" | "not_product";

/**
 * `message` is the French guidance, kept for the server-side schema (src/domain/schemas.ts) until the
 * server messages are translated; localized views use `kind`, `reason` and `platform` instead.
 */
export type SupplierUrl =
  | { kind: "product"; platform: SupplierPlatform; productId: string; canonicalUrl: string }
  | { kind: "short_link"; message: string }
  | { kind: "not_a_supplier_url" }
  | { kind: "invalid"; reason: SupplierUrlIssue; platform?: SupplierPlatform; message: string };

const SHORT_LINK_MESSAGE = "Lien court : ouvre-le et colle l'adresse finale de la fiche produit.";
const MALFORMED_MESSAGE = "Adresse invalide : colle l'adresse complète de la fiche produit.";
const NOT_WEB_MESSAGE = "Adresse refusée : seules les adresses web en http ou https sont acceptées.";

const SHORT_LINK_HOSTS: ReadonlySet<string> = new Set([
  "s.click.aliexpress.com",
  "a.aliexpress.com",
  "share.temu.com",
  "temu.to",
]);

const PLATFORM_DOMAINS: ReadonlyArray<{ platform: SupplierPlatform; domain: string; label: string }> = [
  { platform: "aliexpress", domain: "aliexpress.com", label: "AliExpress" },
  { platform: "temu", domain: "temu.com", label: "Temu" },
  { platform: "alibaba", domain: "alibaba.com", label: "Alibaba" },
  { platform: "1688", domain: "1688.com", label: "1688" },
];

const ALIEXPRESS_PATH = /^\/item\/(\d+)\.html$/i;
const TEMU_PATH = /-g-(\d+)\.html$/i;
const ALIBABA_PATH = /_(\d+)\.html$/i;
const OFFER_1688_PATH = /^\/offer\/(\d+)\.html$/i;
const DIGITS = /^\d+$/;

/** A leading URI scheme such as `https:` or `javascript:`. */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
/** Schemes that run or embed content: always treated as a URL attempt, even inside prose. */
const SCRIPT_SCHEMES: ReadonlySet<string> = new Set(["javascript", "vbscript", "data"]);
/** A host-looking first token (`fr.aliexpress.com/…`), for addresses pasted without their scheme. */
const BARE_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$)/i;
const WHITESPACE = /\s/;

export function parseSupplierUrl(input: string): SupplierUrl {
  const text = input.trim();
  if (text === "") return { kind: "not_a_supplier_url" };

  const scheme = SCHEME.exec(text);
  if (scheme && looksLikeUrlAttempt(text, scheme[1])) return parseAbsoluteUrl(text);

  if (!WHITESPACE.test(text) && BARE_HOST.test(text)) return parseBareHost(text);

  return { kind: "not_a_supplier_url" };
}

function looksLikeUrlAttempt(text: string, scheme: string): boolean {
  if (text.slice(scheme.length + 1).startsWith("//")) return true;
  if (SCRIPT_SCHEMES.has(scheme.toLowerCase())) return true;
  // « Pack : 3 paires » is prose; a single token like `mailto:x` is an address.
  return !WHITESPACE.test(text);
}

function parseAbsoluteUrl(text: string): SupplierUrl {
  const url = toUrl(text);
  if (!url) return { kind: "invalid", reason: "malformed", message: MALFORMED_MESSAGE };
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "invalid", reason: "not_web", message: NOT_WEB_MESSAGE };
  return classify(url);
}

/** Without a scheme the input may just be a product name with a dot (« v2.0 »): only a supplier host counts. */
function parseBareHost(text: string): SupplierUrl {
  const url = toUrl(`https://${text}`);
  return url ? classify(url) : { kind: "not_a_supplier_url" };
}

function toUrl(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function classify(url: URL): SupplierUrl {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (SHORT_LINK_HOSTS.has(host)) return { kind: "short_link", message: SHORT_LINK_MESSAGE };

  const match = PLATFORM_DOMAINS.find(({ domain }) => host === domain || host.endsWith(`.${domain}`));
  if (!match) return { kind: "not_a_supplier_url" };

  return (
    productFrom(match.platform, url) ?? {
      kind: "invalid",
      reason: "not_product",
      platform: match.platform,
      message: `Ce lien ${match.label} ne mène pas à une fiche produit : colle l'adresse de la fiche.`,
    }
  );
}

function productFrom(platform: SupplierPlatform, url: URL): SupplierUrl | null {
  const base = `${url.origin}${url.pathname}`;
  const product = (productId: string, canonicalUrl: string = base): SupplierUrl => ({
    kind: "product",
    platform,
    productId,
    canonicalUrl,
  });

  switch (platform) {
    case "aliexpress": {
      const id = ALIEXPRESS_PATH.exec(url.pathname)?.[1];
      return id ? product(id) : null;
    }
    case "temu": {
      const goodsId = url.searchParams.get("goods_id");
      if (goodsId && DIGITS.test(goodsId)) return product(goodsId, `${base}?goods_id=${goodsId}`);
      const id = TEMU_PATH.exec(url.pathname)?.[1];
      return id ? product(id) : null;
    }
    case "alibaba": {
      const id = ALIBABA_PATH.exec(url.pathname)?.[1];
      return id ? product(id) : null;
    }
    case "1688": {
      const id = OFFER_1688_PATH.exec(url.pathname)?.[1];
      return id ? product(id) : null;
    }
  }
}
