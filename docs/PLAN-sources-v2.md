# Data sources v2 — plan (2026-10-15)

Goal: every analysis collects real data from every reachable source, adds import taxes per country, and makes
keyed sources easy to connect. Decisions taken with the owner on 2026-10-15:

- Google Autocomplete: used, flagged as an undocumented public endpoint.
- Keyed sources to add, each with a step-by-step guide: YouTube Data API, eBay Browse API, AliExpress Affiliate API.
- Product origin country: entered for every analysis (no default).
- Import duties enter the unit margin, the profitable CPA and the score.
- Google Ads Keyword Planner stays as is (works as soon as the Cloud project gets Basic access).

## Verified before coding (live probes or official docs, 2026-10-15)

| Source | Access | Verified |
|---|---|---|
| Google Autocomplete `suggestqueries.google.com/complete/search?client=firefox&hl=&gl=` | none (unofficial) | HTTP 200, per-country suggestions |
| Google Trends web endpoints | none | HTTP 429 — not usable, not integrated |
| Google Custom Search JSON API | key | closed to new customers, shuts down 2027-01-01 — not integrated |
| Wikimedia pageviews + Wikidata | none | HTTP 200 |
| UK Trade Tariff `/uk/api` (GB) and `/xi/api` (Northern Ireland, applies the EU tariff) | none (rate limited since 2026-09) | HTTP 200; XI returns the EU third-country duty and the EU "Low-value consignment customs duty 3.00 EUR" |
| USITC HTS `hts.usitc.gov/reststop/search?keyword=<HS6>` | none | HTTP 200, general / special / column 2 rates |
| VAT rates `api.vatcomply.com/vat_rates` | none | EU-27 standard rates only |
| ECB reference FX (Frankfurter) | none | HTTP 200 |
| eBay Browse `GET /buy/browse/v1/item_summary/search` | client-credentials token, scope `https://api.ebay.com/oauth/api_scope` | official OpenAPI spec: `limit` ≤ 200, `total`, `itemSummaries[].price`, `itemLocation.country`, filter `itemLocationCountry` |
| AliExpress `aliexpress.affiliate.product.query` via `https://api-sg.aliexpress.com/sync` | app key + secret (+ tracking ID) | official docs; HMAC-SHA256 signature reproduces both official test vectors |
| YouTube Data API v3 `search.list` / `videos.list` | API key | official reference (100 / 1 quota units) |

Regulatory facts used by the tax engine (with sources in code):
EU temporary €3 duty per item on consignments < €150 since 2026-07-01; US de minimis suspended for all countries
since 2025-08-29; GB low-value (≤ £135) imports: no customs duty, VAT charged at sale.

## Phases

1. Contracts and registry for the new capabilities; connector metadata (what it brings, cost, setup time, guide).
2. No-key adapters: autocomplete, Wikimedia, UK/XI tariff, USITC, VAT rates, ECB FX.
3. Keyed adapters: YouTube, eBay, AliExpress (+ live test in the settings form).
4. Engine: origin + HS code input, classification, import taxes, sourcing, marketplace and content signals,
   topic-interest fallback for trend and seasonality, scoring model v2 (new criteria, weights still sum to 100).
5. UI: form fields, new sections on the analysis and country pages, guided connectors page.
6. Live end-to-end analysis with the no-key sources, checks, build.

## Honesty rules kept

- Proxies (autocomplete, YouTube, Wikipedia, eBay listings) never become search volumes; sales P10/P50/P90 still
  require Keyword Planner volumes.
- Wikipedia pageviews are per language edition, not per country: shown and used as a category-level shape only.
- HS classification found by keyword search is a proposal, always shown with the option to override it.
- Countries without a national eBay site (LU, PT, SE, DK) stay DATA_INSUFFICIENT for marketplace data.
- Duties that cannot be computed from an official source (CH, CA, AU, US additional chapter 99 duties) are
  reported as such, never estimated silently.
