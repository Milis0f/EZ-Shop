import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveSettings = vi.fn();
vi.mock("@/server/secrets/settings-store", () => ({ saveSettings }));

const { GET } = await import("./route");
const { startSignIn, GOOGLE_ADS_SCOPE } = await import("@/server/oauth/google");

const HOST = "localhost:3001";
const callback = (query: string, host = HOST) => GET(new Request(`http://${host}/api/oauth/google/callback?${query}`, { headers: { host } }));
const outcome = (response: Response) => new URL(response.headers.get("location") ?? "").searchParams.get("oauth");
const newState = (now?: number) => new URL(startSignIn({ clientId: "own.apps.googleusercontent.com", port: "3001", returnTo: `http://${HOST}`, now })).searchParams.get("state") ?? "";
const tokenAnswer = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })));

const saved = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  saveSettings.mockResolvedValue({ inVault: 1 });
  process.env.GOOGLE_ADS_CLIENT_ID = "own.apps.googleusercontent.com";
  process.env.GOOGLE_ADS_CLIENT_SECRET = "own-secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...saved };
});

describe("GET /api/oauth/google/callback", () => {
  it("saves the refresh token, and goes back to the Sources page saying so", async () => {
    tokenAnswer({ access_token: "a", refresh_token: "1//refresh", scope: GOOGLE_ADS_SCOPE });
    const response = await callback(`state=${newState()}&code=4/abc`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://${HOST}/connectors?oauth=connected#google-ads-keyword-planner`);
    expect(saveSettings).toHaveBeenCalledWith([{ key: "GOOGLE_ADS_REFRESH_TOKEN", value: "1//refresh" }], expect.any(String));
  });

  it("saves nothing when the person refuses or cancels on Google's page", async () => {
    for (const error of ["access_denied", "consent_required"]) {
      expect(outcome(await callback(`state=${newState()}&error=${error}`))).toBe("denied");
    }
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("refuses a callback this server did not start, a replayed one, an expired one, and one without a code", async () => {
    tokenAnswer({ access_token: "a", refresh_token: "1//r", scope: GOOGLE_ADS_SCOPE });
    expect(outcome(await callback("state=forged&code=4/abc"))).toBe("refused");
    expect(outcome(await callback("code=4/abc"))).toBe("refused");
    const once = newState();
    expect(outcome(await callback(`state=${once}&code=4/abc`))).toBe("connected");
    expect(outcome(await callback(`state=${once}&code=4/abc`))).toBe("refused");
    expect(outcome(await callback(`state=${newState(Date.now() - 11 * 60_000)}&code=4/abc`))).toBe("refused");
    expect(outcome(await callback(`state=${newState()}`))).toBe("refused");
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it("says why when Google refuses the code, gives no refresh token or not the Google Ads permission", async () => {
    tokenAnswer({ error: "invalid_grant" }, 400);
    expect(outcome(await callback(`state=${newState()}&code=4/expired`))).toBe("exchange_failed");
    tokenAnswer({ access_token: "a", scope: GOOGLE_ADS_SCOPE });
    expect(outcome(await callback(`state=${newState()}&code=4/abc`))).toBe("no_refresh_token");
    tokenAnswer({ access_token: "a", refresh_token: "1//r", scope: "openid email" });
    expect(outcome(await callback(`state=${newState()}&code=4/abc`))).toBe("scope_missing");
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("reports a token that could not be saved", async () => {
    tokenAnswer({ access_token: "a", refresh_token: "1//r", scope: GOOGLE_ADS_SCOPE });
    saveSettings.mockRejectedValueOnce(new Error("locked"));
    expect(outcome(await callback(`state=${newState()}&code=4/abc`))).toBe("save_failed");
  });

  it("answers only on this computer", async () => {
    expect((await callback(`state=${newState()}&code=4/abc`, "evil.example:3001")).status).toBe(403);
  });
});
