#!/usr/bin/env node
/**
 * Checks the connection to your own Shopify store, from the settings in .env.local:
 *
 *   npm run shopify:check
 *
 * It trades the app's client ID and secret for a 24-hour access token (client credentials grant), then
 * reads the store's name and counts. It prints no secret, no token, and no customer data.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const API_VERSION = "2026-01";
const TIMEOUT_MS = 15_000;

/** KEY=value lines of .env.local, without a dependency. Quotes around a value are removed. */
function readEnvFile(file) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const env = { ...readEnvFile(path.resolve(".env.local")), ...process.env };
const domain = (env.SHOPIFY_STORE_DOMAIN ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
const clientId = (env.SHOPIFY_CLIENT_ID ?? "").trim();
const clientSecret = (env.SHOPIFY_CLIENT_SECRET ?? "").trim();

if (!domain || !clientId || !clientSecret) fail("Fill SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env.local.");
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) fail(`SHOPIFY_STORE_DOMAIN must be the store's xxx.myshopify.com address (got "${domain}").`);

const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  signal: AbortSignal.timeout(TIMEOUT_MS),
}).catch(() => null);
if (!tokenResponse) fail("The store could not be reached. Check the address and the connection.");
const tokenBody = await tokenResponse.json().catch(() => ({}));
if (!tokenResponse.ok || typeof tokenBody.access_token !== "string") {
  // Shopify's error code only: its message could echo what was sent.
  const code = typeof tokenBody.error === "string" ? tokenBody.error : `HTTP ${tokenResponse.status}`;
  const hint =
    code === "shop_not_permitted"
      ? "The store is not in the same Dev Dashboard organisation as the app."
      : code === "invalid_client"
        ? "The client ID or secret is wrong."
        : "Check that the app is installed on this store.";
  fail(`Shopify refused the connection (${code}). ${hint}`);
}

const query = `{
  shop { name myshopifyDomain currencyCode plan { displayName } }
  productsCount { count }
  ordersCount { count }
}`;
const apiResponse = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": tokenBody.access_token },
  body: JSON.stringify({ query }),
  signal: AbortSignal.timeout(TIMEOUT_MS),
}).catch(() => null);
if (!apiResponse?.ok) fail(`The Admin API did not answer (${apiResponse ? `HTTP ${apiResponse.status}` : "no response"}).`);
const { data, errors } = await apiResponse.json();

const scopes = String(tokenBody.scope ?? "").split(",").filter(Boolean);
console.log(`✓ Connected to ${data?.shop?.name ?? "?"} (${data?.shop?.myshopifyDomain ?? domain})`);
console.log(`  Plan: ${data?.shop?.plan?.displayName ?? "?"}, currency: ${data?.shop?.currencyCode ?? "?"}`);
console.log(`  Products: ${data?.productsCount?.count ?? "not readable"}`);
console.log(`  Orders: ${data?.ordersCount?.count ?? "not readable"}`);
console.log(`  Access granted: ${scopes.length ? scopes.join(", ") : "none"}`);
for (const wanted of ["read_products", "read_inventory", "read_orders", "read_reports"]) {
  if (!scopes.includes(wanted)) console.log(`  ! Missing ${wanted}: add it to the app's access and release a new version.`);
}
if (errors?.length) console.log(`  Some data was refused: ${errors.map((e) => e.extensions?.code ?? "error").join(", ")}`);
