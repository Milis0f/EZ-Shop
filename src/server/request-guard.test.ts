import { describe, expect, it } from "vitest";
import { checkJsonPost } from "./request-guard";

const JSON_TYPE = "application/json";
const HOST = "localhost:3100";

const UNSUPPORTED = { ok: false, status: 415, code: "unsupported_media_type" };
const FORBIDDEN = { ok: false, status: 403, code: "forbidden_origin" };

interface Row {
  readonly name: string;
  readonly headers: Record<string, string>;
  readonly expected: { readonly ok: true } | typeof UNSUPPORTED | typeof FORBIDDEN;
}

const OK = { ok: true } as const;

const ROWS: readonly Row[] = [
  // Accepted
  { name: "JSON without Origin (curl, local script)", headers: { "content-type": JSON_TYPE }, expected: OK },
  {
    name: "JSON with a charset parameter and a matching Origin",
    headers: { "content-type": "application/json; charset=utf-8", origin: `http://${HOST}`, host: HOST },
    expected: OK,
  },
  {
    name: "media type in mixed case",
    headers: { "content-type": "Application/JSON", origin: `http://${HOST}`, host: HOST },
    expected: OK,
  },
  {
    name: "Origin and Host compared case-insensitively",
    headers: { "content-type": JSON_TYPE, origin: "HTTP://LOCALHOST:3100", host: "localhost:3100" },
    expected: OK,
  },
  {
    name: "https Origin matching a Host without port",
    headers: { "content-type": JSON_TYPE, origin: "https://app.example", host: "app.example" },
    expected: OK,
  },

  // 415: wrong media type (the cross-site form / text/plain trick needs no CORS preflight)
  { name: "text/plain", headers: { "content-type": "text/plain" }, expected: UNSUPPORTED },
  { name: "no Content-Type", headers: {}, expected: UNSUPPORTED },
  { name: "multipart/form-data", headers: { "content-type": "multipart/form-data; boundary=x" }, expected: UNSUPPORTED },
  { name: "application/x-www-form-urlencoded", headers: { "content-type": "application/x-www-form-urlencoded" }, expected: UNSUPPORTED },
  { name: "a look-alike media type", headers: { "content-type": "application/jsonp" }, expected: UNSUPPORTED },
  {
    name: "wrong media type is reported before a foreign Origin (media type is checked first)",
    headers: { "content-type": "text/plain", origin: "https://evil.example", host: HOST },
    expected: UNSUPPORTED,
  },

  // 403: Origin that is not the Host
  {
    name: "Origin on another port",
    headers: { "content-type": JSON_TYPE, origin: "http://localhost:3000", host: HOST },
    expected: FORBIDDEN,
  },
  {
    name: "Origin on another host",
    headers: { "content-type": JSON_TYPE, origin: "https://evil.example", host: HOST },
    expected: FORBIDDEN,
  },
  {
    name: "forged X-Forwarded-Host is ignored",
    headers: { "content-type": JSON_TYPE, origin: "https://evil.example", host: HOST, "x-forwarded-host": "evil.example" },
    expected: FORBIDDEN,
  },
  {
    name: "Origin: null (sandboxed iframe, privacy-sensitive context)",
    headers: { "content-type": JSON_TYPE, origin: "null", host: HOST },
    expected: FORBIDDEN,
  },
  {
    name: "Origin that is not a URL",
    headers: { "content-type": JSON_TYPE, origin: "not a url", host: HOST },
    expected: FORBIDDEN,
  },
  {
    name: "empty Origin header",
    headers: { "content-type": JSON_TYPE, origin: "", host: HOST },
    expected: FORBIDDEN,
  },
  {
    name: "Origin present but Host missing",
    headers: { "content-type": JSON_TYPE, origin: `http://${HOST}` },
    expected: FORBIDDEN,
  },

  // 403: malformed Origin (never matched leniently against Host)
  ...[
    "http://",
    "localhost:3100",
    "javascript:alert(1)",
    "file:///etc",
    "ftp://localhost:3100",
    "http://localhost:3100/path",
    "http://localhost:3100/",
    "http://localhost:3100?x=1",
    "http://localhost:3100#frag",
    "http://user@localhost:3100",
    "http://user:pass@localhost:3100",
    "http://localhost:3100, http://evil.example",
    "http://evil.example, http://localhost:3100",
    "http://localhost:3100,",
    "http://[::1",
  ].map<Row>((origin) => ({
    name: `malformed Origin ${JSON.stringify(origin)}`,
    headers: { "content-type": JSON_TYPE, origin, host: HOST },
    expected: FORBIDDEN,
  })),
];

describe("checkJsonPost", () => {
  it.each(ROWS)("$name", ({ headers, expected }) => {
    expect(checkJsonPost(new Headers(headers))).toEqual(expected);
  });

  it("matches an IPv6 literal Origin against the same Host", () => {
    const headers = new Headers({ "content-type": JSON_TYPE, origin: "http://[::1]:3100", host: "[::1]:3100" });
    expect(checkJsonPost(headers)).toEqual(OK);
  });
});
