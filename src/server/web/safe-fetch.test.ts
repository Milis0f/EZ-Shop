import { describe, expect, it, vi } from "vitest";
import { checkPublicUrl, fetchPublic, fetchRespectingRobots, isPublicAddress, MAX_PAGE_BYTES, parseRobots, robotsAllows, type FetchDeps } from "./safe-fetch";

const publicDns = async () => ["93.184.216.34"];
const deps = (fetchImpl: typeof fetch, lookup: FetchDeps["lookup"] = publicDns): FetchDeps => ({ fetch: fetchImpl, lookup });
const html = (body: string, init: ResponseInit = {}) => new Response(body, { headers: { "content-type": "text/html" }, ...init });

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "not-an-ip"])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("accepts %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("checkPublicUrl", () => {
  const noFetch = vi.fn() as unknown as typeof fetch;

  it.each([
    ["file:///etc/passwd", "invalid_url"],
    ["ftp://example.com/x", "invalid_url"],
    ["https://user:pass@example.com/", "invalid_url"],
    ["not a url", "invalid_url"],
    ["http://localhost/admin", "private_address"],
    ["http://127.0.0.1:3000/", "private_address"],
    ["http://[::1]/", "private_address"],
    ["http://169.254.169.254/latest/meta-data", "private_address"],
    ["https://example.com:8443/", "private_address"],
    ["http://printer.local/", "private_address"],
  ])("refuses %s", async (url, code) => {
    expect(await checkPublicUrl(url, deps(noFetch))).toEqual({ ok: false, code });
  });

  it("refuses a name that resolves to a private address, even among public ones", async () => {
    const result = await checkPublicUrl("https://rebind.example/", deps(noFetch, async () => ["93.184.216.34", "10.0.0.5"]));
    expect(result).toEqual({ ok: false, code: "private_address" });
  });

  it("reports a name that does not resolve", async () => {
    const result = await checkPublicUrl("https://nope.example/", deps(noFetch, async () => Promise.reject(new Error("ENOTFOUND"))));
    expect(result).toEqual({ ok: false, code: "unreachable" });
  });
});

describe("fetchPublic", () => {
  it("does not follow a redirect to a private address", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8888/search" } }));
    expect(await fetchPublic("https://shop.example/", deps(fetchImpl as unknown as typeof fetch))).toEqual({ ok: false, code: "private_address" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a redirect to a public page", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith("/old") ? new Response(null, { status: 301, headers: { location: "/new" } }) : html("ok")));
    const result = await fetchPublic("https://shop.example/old", deps(fetchImpl as unknown as typeof fetch));
    expect(result).toMatchObject({ ok: true, url: "https://shop.example/new", body: "ok" });
  });

  it("stops after too many redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/again" } }));
    expect(await fetchPublic("https://shop.example/", deps(fetchImpl as unknown as typeof fetch))).toEqual({ ok: false, code: "http_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("refuses a page over the size limit", async () => {
    const fetchImpl = vi.fn(async () => html("x".repeat(MAX_PAGE_BYTES + 1)));
    expect(await fetchPublic("https://shop.example/", deps(fetchImpl as unknown as typeof fetch))).toEqual({ ok: false, code: "too_large" });
  });

  it("reports HTTP errors and network failures without details", async () => {
    const refused = vi.fn(async () => html("secret page", { status: 403 }));
    expect(await fetchPublic("https://shop.example/", deps(refused as unknown as typeof fetch))).toEqual({ ok: false, code: "http_error" });
    const down = vi.fn(async () => Promise.reject(new Error("ECONNRESET")));
    expect(await fetchPublic("https://shop.example/", deps(down as unknown as typeof fetch))).toEqual({ ok: false, code: "unreachable" });
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(`
User-agent: Googlebot
Disallow: /only-google

User-agent: *
Disallow: /admin
Disallow: /*?sort=
Allow: /admin/public
Disallow: /checkout$
# comment
`);

  it.each([
    ["/products/cap", true],
    ["/only-google", true],
    ["/admin", false],
    ["/admin/users", false],
    ["/admin/public/page", true],
    ["/collections?sort=price", false],
    ["/checkout", false],
    ["/checkout/thanks", true],
  ])("%s → %s", (path, allowed) => {
    expect(robotsAllows(rules, path)).toBe(allowed);
  });

  it("reads a group naming several agents", () => {
    expect(robotsAllows(parseRobots("User-agent: a\nUser-agent: *\nDisallow: /x"), "/x")).toBe(false);
  });

  it("does not read a page the site forbids", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /") : html("page")));
    expect(await fetchRespectingRobots("https://shop.example/products/a", deps(fetchImpl as unknown as typeof fetch))).toEqual({ ok: false, code: "robots" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reads the page when robots.txt is missing", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.endsWith("/robots.txt") ? new Response("", { status: 404 }) : html("page")));
    expect(await fetchRespectingRobots("https://shop.example/a", deps(fetchImpl as unknown as typeof fetch))).toMatchObject({ ok: true, body: "page" });
  });
});
