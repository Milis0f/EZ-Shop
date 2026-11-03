# Data connectors

EZ-Shop calls every provider directly from the computer it runs on. There is no EZ-Shop server, no
proxy, no shared key: each person uses the public sources as they are and, for the others, their own
account. This page says what each source really gives, how it was checked, and what is left to do.

Last full check: **2026-11-03**, on Windows 11, from `EZ_LIVE=1 npm test -- live.integration`
(one real read per source, the same probe as the **Test now** button of the Sources page).

## How a source is described

Each connector declares its metadata once, in its adapter (`src/providers/*/adapter.ts`, type
`ProviderMeta` in `src/providers/contracts.ts`):

| Field | Meaning |
|---|---|
| `access` | `open` (no account), `account` (the person's key or app), `approval` (the provider must approve) |
| `maturity` | `stable`, `beta`, `experimental`, `deprecated`, `disabled` (independent of the access) |
| `verification` | `live_verified`, `documented_unverified`, `not_implemented` |
| `lastVerifiedAt` | the day the project checked it against the real service, or `null` |
| `termsUrl` | the provider's terms, only when checked; `null` otherwise |
| `unofficial` | an endpoint its owner does not document as an API |

The access class shown to people is **derived** (`accessClass()`), never declared twice:

- **A — automatic**: `access: open`. Works right after installing.
- **B — one-click**: an official sign-in with a public client of EZ-Shop. **No source qualifies yet**
  (see "One-click sign-in" below).
- **C — advanced**: the person's own key, developer app or approval.
- **D — not qualified**: `not_implemented` or `disabled`. Shown as such, never as available.

Every value keeps its provenance (`SourceRef`: source, query, collection date, period, origin) and its
nature (`Datum`: observed, estimated, insufficient…). A missing value is `DATA_INSUFFICIENT`, never
replaced by another metric.

## Inventory

All 19 connectors are built into every analysis (`src/server/pipeline/collect.ts`, `collect-global.ts`);
an unconfigured one answers `not_configured` at once, without a network call.

| Source | Class | Maturity | Auth | Real test 2026-11-03 | Notes |
|---|---|---|---|---|---|
| World Bank Indicators | A | stable | none | ok, 650 ms | CC BY 4.0 data |
| Eurostat | A | stable | none | ok, 302 ms | |
| OECD (SDMX) | A | stable | none | ok, 109 ms | |
| Google Autocomplete | A | experimental | none | ok, 102 ms | **unofficial** endpoint: may change or be throttled |
| Wikipedia pageviews (Wikimedia) | A | stable | none | ok, 616 ms | User-Agent carries the project URL: 200 req/min |
| UK Trade Tariff (GB, XI) | A | stable | none | ok, 201 ms | fixed: headings with no subdivision (9617) |
| USITC HTS (US) | A | stable | none | ok, 464 ms | classification goes through the UK tariff (HS) |
| VAT rates | A | experimental | none | ok, **12.6 s** | EU via vatcomply.com, a third party with no stated source |
| ECB reference rates | A | stable | none | ok, 235 ms | now the **official** ECB Data Portal (was the Frankfurter mirror) |
| MyMemory translation | A | beta | none | ok, 914 ms | 5,000 characters/day anonymous |
| YouTube Data API | C | beta | API key | not configured | 10,000 units/day per Google Cloud project |
| eBay Browse API | C | beta | OAuth client credentials | not configured | |
| AliExpress Affiliate | C | beta | app key + signature | not configured | app approval |
| Google Ads Keyword Planner | C | beta | OAuth | **403, access level** | see below |
| Meta Ad Library | C | beta | user token | not configured | identity verification |
| TikTok Commercial Content | C | beta | client credentials | not configured | research approval |
| Google Trends API (alpha) | D | disabled | API key | not implemented | alpha on application; response format not public |
| Meta Marketing (delivery estimate) | D | disabled | OAuth | not implemented | |
| TikTok API for Business | D | disabled | OAuth | not implemented | |

Not tested for real: every source of class C except Google Ads (no account configured on the test machine).
Their unit tests run on stubbed HTTP and prove the mapping, not the provider's availability.

## Google Ads and Keyword Planner

Checked against Google's own pages on 2026-11-03:

- **Developer tokens were sunset on 2026-09-09.** Access levels now belong to the **Google Cloud project
  that owns the OAuth client**, managed on the Google Ads API Overview page of the Cloud Console
  (`https://console.cloud.google.com/google/ads-apis/overview`). A token sent today is ignored, and a
  future major version will reject it. EZ-Shop sends none.
  [Developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)
- **Levels**: Test (test accounts only), Explorer (production limited to 2,880 operations a day),
  Basic (15,000 a day), Standard (unlimited). **Explorer excludes the planning services**
  (`KeywordPlanIdeaService`, `KeywordPlanService`): Keyword Planner needs **Basic or Standard**.
  Basic requires brand verification first. [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- **Known issue (Google)**: some projects upgraded after 2026-09-09 get `AUTHORIZATION_ERROR` on
  production accounts; Google's workaround is a new Cloud project.
- **Real test**: OAuth works (the refresh token gives an access token, the API answers), and the call to
  `generateKeywordHistoricalMetrics` (API v26) is refused with `403 DEVELOPER_TOKEN_NOT_APPROVED`: the
  project has no Basic access.

**What the owner of the Cloud project must do**: Cloud Console → Google Ads API Overview → *Upgrade
access level* → complete brand verification → *Apply for access* (Basic). Then **Test now** on the Sources
page. An OAuth success alone never marks the source as working.

## Shopify (competitor check)

Public reads of a shop, no key, paced (about one request a second per shop) and within robots.txt:

- `/products.json` (catalogue, 250 a page, up to 4 pages), `/meta.json` (shop card), `/collections.json`.
- **Storefront API, tokenless** (`/api/2026-10/graphql.json`, POST), documented by Shopify: products,
  collections and search are open; tags, metafields, menus and customers need a token; query complexity
  must stay under 1,000. EZ-Shop reads the currencies, languages and countries the shop sells in, its
  best-selling order (`sortKey: BEST_SELLING`) and **the checked product's price in up to 5 of its
  countries, in their currency** (`@inContext(country)`).
  [Storefront API](https://shopify.dev/docs/api/storefront)

Real test on 2026-11-03: authentiksneakers.com, allbirds.com and deathwishcoffee.com answered (prices by
country, e.g. 145 EUR in France and 137 CHF in Switzerland); gymshark.com and bombas.com did not (shown
as "absent" in the report's sources). A product count is the count the shop exposes, never a claim on
its real catalogue; reviews are never sales; a Tranco rank is never a number of visits.

## Signing in with Google (OAuth on this computer)

Google Ads no longer needs a refresh token copied by hand. **Sources → Google Ads → Authorize my Google
Ads account** runs the OAuth 2.0 authorization code flow with **PKCE (S256)** and a loopback redirect to
`http://127.0.0.1:<port>/api/oauth/google/callback`, as Google documents for desktop apps, which it calls
public clients that "cannot keep secrets confidential" (client secret optional).
[OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)

- The state is single-use and expires after 10 minutes; a forged or replayed callback is refused.
- The refresh token goes to the system's credential store; nothing is logged.
- A successful sign-in does not mark Google Ads as working: **Test now** says what the access level allows.
- The OAuth client must be of type **Desktop app**. A "Web application" client answers
  `redirect_uri_mismatch` (checked on 2026-11-03 with the test machine's client) unless the exact URI
  `http://127.0.0.1:<port>/api/oauth/google/callback` is added to its authorized redirect URIs.

## One-click sign-in (class B)

No source is class B yet. The Google sign-in above becomes one click once the project registers its own
**Desktop app** OAuth client and puts its client ID (public, no secret) in
`EZ_SHOP_GOOGLE_PUBLIC_CLIENT_ID` (`src/server/oauth/google.ts`). That is the project owner's step, with
Google's brand verification and, for the `adwords` scope, the sensitive-scope review. Note that every user
signing in through the project's client would share **its** Google Ads access level and daily operations
(Basic: 15,000 a day); a person's own client keeps their own quota. Other providers (Microsoft Advertising,
eBay, Meta, TikTok) need their own qualification before any OAuth code is written.

## Secrets

Keys, client secrets and tokens are kept by the system's credential store (Windows Credential Manager,
macOS Keychain, Linux Secret Service; `src/server/secrets/`), loaded at the server start and kept in memory.
Without a usable store they stay in `.env.local`. No secret is in the repository; the only OAuth value
meant to ship is a public client ID, and none ships today.

## Quotas and errors

The shared HTTP layer (`src/providers/http.ts`) applies a timeout to every call, retries transient
failures (5xx, timeout, network) with an exponential backoff and jitter, follows a provider's
`Retry-After`, and does not retry when it asks to wait more than 30 s. Errors are typed codes
(`unauthorized`, `rate_limited`, `timeout`…); their text never carries a key. Public sources are cached
in the local database (`provider_cache`) for their own update rhythm.

## Tests

| Kind | Command | Network |
|---|---|---|
| Unit and mapping tests | `npm test` | none (stubbed fetch) |
| Real read of every source | `EZ_LIVE=1 npm test -- live.integration` | yes, keys from `.env.local`, never printed |
| One source, from the app | Sources page → **Test now** | yes; the last result is kept 90 days |
| Credential store | `src/server/secrets/vault.test.ts` (fake store) | none; checked once for real on Windows on 2026-11-03 |
| Google sign-in | `src/server/oauth/google.test.ts` (PKCE, state, exchange) | none; the redirect to Google checked for real |

## What is left, and who can do it

| Item | Who |
|---|---|
| Basic access for the Google Cloud project (Keyword Planner) | the project owner, Cloud Console |
| A Desktop OAuth client for the Google sign-in | each person, or the project for class B |
| Real tests of YouTube, eBay, AliExpress, Meta Ad Library, TikTok | anyone with those accounts: configure, then **Test now** |
| Google Trends API | apply for the alpha; the response mapping is written once access exists |
| Meta / TikTok ad cost estimates | developer apps and approvals, then the adapters (`src/providers/ad-cost/`) |
| Microsoft Advertising keyword planning | a developer token and an OAuth app (not started) |
| More marketplaces (Etsy, Walmart, Mercado Libre…) | qualified one by one before any code |
