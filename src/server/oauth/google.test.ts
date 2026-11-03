import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CALLBACK_PATH, exchangeCode, GOOGLE_ADS_SCOPE, pkcePair, startSignIn, takePending } from "./google";

const token = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Google sign-in on this computer (PKCE, loopback)", () => {
  it("derives the S256 challenge from the verifier", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("asks Google for the Google Ads scope, offline, with PKCE and a 127.0.0.1 redirect", () => {
    const url = new URL(startSignIn({ clientId: "abc.apps.googleusercontent.com", port: "3001", returnTo: "http://localhost:3001" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "abc.apps.googleusercontent.com",
      redirect_uri: `http://127.0.0.1:3001${CALLBACK_PATH}`,
      response_type: "code",
      scope: GOOGLE_ADS_SCOPE,
      code_challenge_method: "S256",
      access_type: "offline",
    });
    expect(url.searchParams.get("client_secret")).toBeNull();
    // The state is good once, then never again (a replayed callback is refused).
    const state = url.searchParams.get("state");
    expect(takePending(state)).toMatchObject({ clientId: "abc.apps.googleusercontent.com", returnTo: "http://localhost:3001" });
    expect(takePending(state)).toBeNull();
    expect(takePending("forged")).toBeNull();
  });

  it("refuses a sign-in left open too long", () => {
    const state = new URL(startSignIn({ clientId: "a", port: "3001", returnTo: "http://localhost:3001", now: 0 })).searchParams.get("state");
    expect(takePending(state, 11 * 60_000)).toBeNull();
  });

  it("trades the code with the verifier and keeps the refresh token only", async () => {
    const state = new URL(startSignIn({ clientId: "a", port: "3001", returnTo: "x" })).searchParams.get("state");
    const entry = takePending(state)!;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("code_verifier")).toBe(entry.verifier);
      expect(body.get("redirect_uri")).toBe(entry.redirectUri);
      expect(body.has("client_secret")).toBe(false);
      return token({ access_token: "ya29.x", refresh_token: "1//rt", scope: `openid ${GOOGLE_ADS_SCOPE}` });
    });
    expect(await exchangeCode("4/code", entry, undefined, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, refreshToken: "1//rt" });
  });

  it("says why when Google gives no refresh token, not the Ads scope, or an error", async () => {
    const entry = { verifier: "v", redirectUri: "r", returnTo: "x", clientId: "a", createdAt: 0 };
    const answer = (body: unknown, status = 200) => (async () => token(body, status)) as unknown as typeof fetch;
    expect(await exchangeCode("c", entry, "s", answer({ access_token: "a", scope: GOOGLE_ADS_SCOPE }))).toEqual({ ok: false, code: "no_refresh_token" });
    expect(await exchangeCode("c", entry, "s", answer({ access_token: "a", refresh_token: "r", scope: "openid" }))).toEqual({ ok: false, code: "scope_missing" });
    expect(await exchangeCode("c", entry, "s", answer({ error: "invalid_grant" }, 400))).toEqual({ ok: false, code: "exchange_failed" });
  });
});
