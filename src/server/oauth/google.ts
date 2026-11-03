import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * "Connect my Google account" for Google Ads, on this computer: OAuth 2.0 authorization code with
 * PKCE (S256) and a loopback redirect to 127.0.0.1, as Google documents for desktop apps, which it
 * calls public clients that "cannot keep secrets confidential".
 * https://developers.google.com/identity/protocols/oauth2/native-app
 *
 * The client is the person's own "Desktop app" OAuth client (GOOGLE_ADS_CLIENT_ID, and its secret
 * when they gave one; Google marks it optional for desktop clients). When the project registers its
 * own public Desktop client, its ID goes in EZ_SHOP_GOOGLE_PUBLIC_CLIENT_ID and the sign-in becomes one
 * click; no secret is ever written in the code. The refresh token goes to the system's credential
 * store. A sign-in that succeeds says nothing yet of the Google Ads access level: the Sources page's
 * test does.
 */

/** The project's own public Desktop client ID, once registered with Google; empty until then. */
export const EZ_SHOP_GOOGLE_PUBLIC_CLIENT_ID = "";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const CALLBACK_PATH = "/api/oauth/google/callback";
/** A sign-in left open longer than this is refused: start it again. */
const PENDING_MS = 10 * 60_000;

const base64url = (bytes: Buffer) => bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function pkcePair(random: (size: number) => Buffer = randomBytes): { verifier: string; challenge: string } {
  const verifier = base64url(random(48));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

interface Pending {
  readonly verifier: string;
  readonly redirectUri: string;
  /** The address the person came from (localhost or 127.0.0.1), to send them back to it. */
  readonly returnTo: string;
  readonly clientId: string;
  readonly createdAt: number;
}

const globalForOauth = globalThis as unknown as { __ezShopOauthPending?: Map<string, Pending> };
const pending = () => (globalForOauth.__ezShopOauthPending ??= new Map());

export interface StartInput {
  readonly clientId: string;
  /** This server's own loopback port. */
  readonly port: string;
  readonly returnTo: string;
  readonly now?: number;
}

/** The Google consent address for a new sign-in; its state and verifier wait here, once. */
export function startSignIn({ clientId, port, returnTo, now = Date.now() }: StartInput): string {
  for (const [state, entry] of pending()) if (now - entry.createdAt > PENDING_MS) pending().delete(state);
  const state = base64url(randomBytes(32));
  const { verifier, challenge } = pkcePair();
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
  pending().set(state, { verifier, redirectUri, returnTo, clientId, createdAt: now });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_ADS_SCOPE,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    // Asks again even when access was granted before, so a refresh token always comes back.
    prompt: "consent",
  });
  return `${AUTH_URL}?${params}`;
}

/** Takes the sign-in a state belongs to, once; null when unknown or too old (a forged or replayed callback). */
export function takePending(state: string | null, now = Date.now()): Pending | null {
  if (!state) return null;
  const entry = pending().get(state);
  pending().delete(state);
  return entry && now - entry.createdAt <= PENDING_MS ? entry : null;
}

const tokenSchema = z.object({ refresh_token: z.string().min(1).optional(), scope: z.string().default(""), access_token: z.string().min(1) });

export type ExchangeResult = { readonly ok: true; readonly refreshToken: string } | { readonly ok: false; readonly code: "exchange_failed" | "no_refresh_token" | "scope_missing" };

/** Trades the code for tokens, with the PKCE verifier; only the refresh token is kept, never logged. */
export async function exchangeCode(code: string, entry: Pending, clientSecret: string | undefined, fetchImpl: typeof fetch = fetch): Promise<ExchangeResult> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: entry.clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        code_verifier: entry.verifier,
        redirect_uri: entry.redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, code: "exchange_failed" };
  }
  if (!response.ok) return { ok: false, code: "exchange_failed" };
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { ok: false, code: "exchange_failed" };
  if (!parsed.data.scope.split(" ").includes(GOOGLE_ADS_SCOPE)) return { ok: false, code: "scope_missing" };
  if (!parsed.data.refresh_token) return { ok: false, code: "no_refresh_token" };
  return { ok: true, refreshToken: parsed.data.refresh_token };
}
