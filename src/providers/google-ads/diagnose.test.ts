import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/config/env";
import { httpText } from "../http";
import { GoogleAdsKeywordPlannerProvider } from "./adapter";
import { describeAdsError, describeOAuthError } from "./errors";

/** Stubbed fetch only: no network, no real credentials. */

const SECRET = "SECRET-REFRESH-999";
const env = {
  NODE_ENV: "test",
  PGLITE_DATA_DIR: ".data/test",
  PROVIDER_HTTP_TIMEOUT_MS: 1000,
  GOOGLE_ADS_API_VERSION: "v99",
  GOOGLE_ADS_CLIENT_ID: "cid.apps.googleusercontent.com",
  GOOGLE_ADS_CLIENT_SECRET: "csecret",
  GOOGLE_ADS_REFRESH_TOKEN: SECRET,
  GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
} as ServerEnv;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const adsError = (status: string, errorCode: Record<string, string>) =>
  json({ error: { code: 403, status, details: [{ "@type": "GoogleAdsFailure", errors: [{ errorCode, message: "long text" }] }] } }, 403);

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => handler(String(input), init)));
}

afterEach(() => vi.unstubAllGlobals());

describe("Google error bodies", () => {
  it("keeps only the OAuth error code and marks rejected credentials as unauthorized", () => {
    expect(describeOAuthError(400, JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }))).toEqual({
      reason: "invalid_grant",
      code: "unauthorized",
    });
    expect(describeOAuthError(400, "not json")).toBeUndefined();
  });

  it("finds the Google Ads error code inside the failure details, or falls back to the status", () => {
    expect(describeAdsError(403, JSON.stringify({ error: { status: "PERMISSION_DENIED", details: [{ errors: [{ errorCode: { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" } }] }] } }))).toEqual({
      reason: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
    });
    expect(describeAdsError(401, JSON.stringify({ error: { status: "UNAUTHENTICATED" } }))).toEqual({ reason: "UNAUTHENTICATED" });
  });

  it("never copies free text from an error body into the message", async () => {
    stubFetch(() => new Response("x", { status: 400 }));
    const result = await httpText("https://x.test", "X", { timeoutMs: 500, describeError: () => ({ reason: "token abc123 leaked here" }) });
    expect(result).toMatchObject({ ok: false, error: { message: "X: HTTP 400" } });
  });
});

describe("GoogleAdsKeywordPlannerProvider.diagnose", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("stops at OAuth with an explanation when the refresh token is rejected", async () => {
    stubFetch(() => json({ error: "invalid_grant", error_description: "Bad Request" }, 400));
    const steps = await new GoogleAdsKeywordPlannerProvider(env, 500).diagnose(now, "fr");
    expect(steps.map((s) => [s.id, s.status])).toEqual([
      ["oauth", "error"],
      ["account", "skipped"],
      ["planner", "skipped"],
    ]);
    expect(steps[0].detail).toContain("Jeton d'actualisation refusé");
    expect(steps[0].items).toEqual(["Code Google : invalid_grant"]);
    expect(JSON.stringify(steps)).not.toContain(SECRET);
  });

  it("explains a Cloud project still in Test access", async () => {
    stubFetch((url) =>
      url.startsWith("https://oauth2") ? json({ access_token: "ya29" }) : adsError("PERMISSION_DENIED", { authorizationError: "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION" }),
    );
    const steps = await new GoogleAdsKeywordPlannerProvider(env, 500).diagnose(now, "fr");
    expect(steps.map((s) => s.status)).toEqual(["ok", "error", "skipped"]);
    expect(steps[1].detail).toContain("accès « Test »");
  });

  it("points to the Basic access level when only Keyword Planner is refused", async () => {
    stubFetch((url, init) => {
      if (url.startsWith("https://oauth2")) return json({ access_token: "ya29" });
      const body = String(init?.body ?? "");
      if (body.includes("customer.currency_code")) return json({ results: [{ customer: { currencyCode: "EUR" } }] });
      if (url.endsWith("/googleAds:search")) return json({ results: [{ languageConstant: { resourceName: "languageConstants/1002" } }] });
      return adsError("PERMISSION_DENIED", { authorizationError: "ACTION_NOT_PERMITTED" });
    });
    const steps = await new GoogleAdsKeywordPlannerProvider(env, 500).diagnose(now, "fr");
    expect(steps.map((s) => s.status)).toEqual(["ok", "ok", "error"]);
    expect(steps[2].detail).toContain("niveau d'accès Basic");
    expect(steps[2].items).toEqual(["Code Google : ACTION_NOT_PERMITTED"]);
  });

  it("reports every step as passed with the volume received", async () => {
    stubFetch((url, init) => {
      if (url.startsWith("https://oauth2")) return json({ access_token: "ya29" });
      const body = String(init?.body ?? "");
      if (body.includes("customer.currency_code")) return json({ results: [{ customer: { currencyCode: "EUR" } }] });
      if (url.endsWith("/googleAds:search")) return json({ results: [{ languageConstant: { resourceName: "languageConstants/1002" } }] });
      return json({ results: [{ text: "chaussettes", keywordMetrics: { avgMonthlySearches: "8100" } }] });
    });
    const steps = await new GoogleAdsKeywordPlannerProvider(env, 500).diagnose(now, "fr");
    expect(steps.map((s) => s.status)).toEqual(["ok", "ok", "ok"]);
    expect(steps[1].detail).toContain("EUR");
    expect(steps[2].detail).toMatch(/8\s?100 recherches/);
  });

  it("names the missing variables instead of calling Google", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const steps = await new GoogleAdsKeywordPlannerProvider({ ...env, GOOGLE_ADS_CLIENT_ID: undefined }, 500).diagnose(now, "fr");
    expect(steps[0]).toMatchObject({ status: "skipped", detail: expect.stringContaining("GOOGLE_ADS_CLIENT_ID") });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes its steps in the requested language", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const steps = await new GoogleAdsKeywordPlannerProvider({ ...env, GOOGLE_ADS_CLIENT_ID: undefined }, 500).diagnose(now, "en");
    expect(steps[0]).toMatchObject({ label: "OAuth connection", detail: expect.stringMatching(/^Missing variables: GOOGLE_ADS_CLIENT_ID/) });
  });
});
