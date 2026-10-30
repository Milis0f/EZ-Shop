import "server-only";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { USER_AGENT } from "@/providers/http";

/**
 * Reads public web pages for the web features. The URL comes from the visitor, so nothing on this
 * machine or its network may be reached (SSRF): http(s) on the standard ports, no credentials, every
 * resolved address public, and each redirect checked again. Answers are read up to a size limit.
 */

export type FetchFailure = "invalid_url" | "private_address" | "robots" | "http_error" | "not_a_page" | "too_large" | "unreachable";

export type FetchResult =
  | { readonly ok: true; readonly url: string; readonly contentType: string; readonly body: string }
  | { readonly ok: false; readonly code: FetchFailure };

export interface FetchDeps {
  readonly lookup: (hostname: string) => Promise<readonly string[]>;
  readonly fetch: typeof fetch;
}

export const DEFAULT_FETCH_DEPS: FetchDeps = {
  lookup: async (hostname) => (await dnsLookup(hostname, { all: true })).map((a) => a.address),
  fetch: (input, init) => fetch(input, init),
};

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
export const MAX_PAGE_BYTES = 2_000_000;

function isPublicIpv4(ip: string): boolean {
  const [a = 0, b = 0, c = 0] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** Hextets of an IPv6 address, "::" expanded. An embedded dotted IPv4 becomes its two hextets. */
function ipv6Hextets(ip: string): number[] {
  const bare = ip.split("%")[0] ?? ip;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(bare);
  const hexOnly = dotted
    ? bare.replace(dotted[0], `${((Number(dotted[1]) << 8) | Number(dotted[2])).toString(16)}:${((Number(dotted[3]) << 8) | Number(dotted[4])).toString(16)}`)
    : bare;
  const [head = "", tail] = hexOnly.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(Math.max(0, zeros)).fill("0"), ...right].map((h) => parseInt(h, 16));
}

function isPublicIpv6(ip: string): boolean {
  const h = ipv6Hextets(ip);
  if (h.length !== 8 || h.some(Number.isNaN)) return false;
  const [h0 = 0, h1 = 0] = h;
  const v4At = (i: number) => `${(h[i] ?? 0) >> 8}.${(h[i] ?? 0) & 255}.${(h[i + 1] ?? 0) >> 8}.${(h[i + 1] ?? 0) & 255}`;
  // Unspecified, loopback and the forms that embed an IPv4 address (mapped, compatible, NAT64, 6to4).
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0 || h[5] === 0xffff)) {
    if (h[5] === 0xffff) return isPublicIpv4(v4At(6));
    return (h[6] ?? 0) !== 0 ? isPublicIpv4(v4At(6)) : false;
  }
  if (h0 === 0x64 && h1 === 0xff9b) return isPublicIpv4(v4At(6));
  if (h0 === 0x2002) return isPublicIpv4(v4At(1));
  if ((h0 & 0xfe00) === 0xfc00) return false; // Unique local.
  if ((h0 & 0xffc0) === 0xfe80) return false; // Link local.
  if ((h0 & 0xff00) === 0xff00) return false; // Multicast.
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip.split("%")[0] ?? ip);
  if (version === 4) return isPublicIpv4(ip);
  if (version === 6) return isPublicIpv6(ip);
  return false;
}

/** The URL if it may be read, or why not. */
export async function checkPublicUrl(raw: string, deps: FetchDeps): Promise<{ ok: true; url: URL } | { ok: false; code: FetchFailure }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, code: "invalid_url" };
  if (url.username || url.password) return { ok: false, code: "invalid_url" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, code: "private_address" };
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { ok: false, code: "private_address" };
  }
  if (isIP(hostname)) return isPublicAddress(hostname) ? { ok: true, url } : { ok: false, code: "private_address" };
  try {
    const addresses = await deps.lookup(hostname);
    if (addresses.length === 0) return { ok: false, code: "unreachable" };
    return addresses.every(isPublicAddress) ? { ok: true, url } : { ok: false, code: "private_address" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}

async function readLimited(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** GET one public URL, following checked redirects. */
export async function fetchPublic(raw: string, deps: FetchDeps = DEFAULT_FETCH_DEPS, accept = "text/html,application/json;q=0.9,*/*;q=0.5"): Promise<FetchResult> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const checked = await checkPublicUrl(current, deps);
    if (!checked.ok) return checked;
    let response: Response;
    try {
      response = await deps.fetch(checked.url.href, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      return { ok: false, code: "unreachable" };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, code: "http_error" };
      await response.body?.cancel().catch(() => undefined);
      current = new URL(location, checked.url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, code: "http_error" };
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const body = await readLimited(response);
    if (body === null) return { ok: false, code: "too_large" };
    return { ok: true, url: checked.url.href, contentType, body };
  }
  return { ok: false, code: "http_error" };
}

/** Rules of the `*` group of a robots.txt, as [allow, path prefix or pattern]. */
export function parseRobots(text: string): ReadonlyArray<readonly [boolean, string]> {
  const rules: Array<readonly [boolean, string]> = [];
  let inGroup = false;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = (rawLine.split("#")[0] ?? "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      const isStar = value === "*";
      inGroup = lastWasAgent ? inGroup || isStar : isStar;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inGroup || !value) continue;
    if (field === "allow") rules.push([true, value]);
    if (field === "disallow") rules.push([false, value]);
  }
  return rules;
}

function ruleMatches(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith("$");
  const source = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(target);
}

/** Longest matching rule wins; on a tie, allow wins. No rule: allowed. */
export function robotsAllows(rules: ReadonlyArray<readonly [boolean, string]>, target: string): boolean {
  let best: readonly [boolean, string] | undefined;
  for (const rule of rules) {
    if (!ruleMatches(rule[1], target)) continue;
    if (!best || rule[1].length > best[1].length || (rule[1].length === best[1].length && rule[0])) best = rule;
  }
  return best ? best[0] : true;
}

/** Whether the site's robots.txt lets us read this URL. A missing or unreadable file allows it. */
export async function isAllowedByRobots(raw: string, deps: FetchDeps = DEFAULT_FETCH_DEPS): Promise<boolean> {
  const url = new URL(raw);
  const robots = await fetchPublic(`${url.origin}/robots.txt`, deps, "text/plain,*/*;q=0.5");
  if (!robots.ok) return true;
  return robotsAllows(parseRobots(robots.body), `${url.pathname}${url.search}`);
}

/** Reads a page only if the site allows it. */
export async function fetchRespectingRobots(raw: string, deps: FetchDeps = DEFAULT_FETCH_DEPS, accept?: string): Promise<FetchResult> {
  const checked = await checkPublicUrl(raw, deps);
  if (!checked.ok) return checked;
  if (!(await isAllowedByRobots(raw, deps))) return { ok: false, code: "robots" };
  return fetchPublic(raw, deps, accept);
}
