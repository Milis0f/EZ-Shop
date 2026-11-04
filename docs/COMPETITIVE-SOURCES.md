# Competitive-intelligence sources

Inventory of the sources EZ-Shop uses, or could use, to describe a competitor from its URL: identity,
visibility, catalogue, prices, ads and history. It starts from the source map written for the project
(Perplexity research, 2026-11) and re-checks the official documentation of every source that EZ-Shop
integrates. Nothing here is a promise of access: a source is integrated only once its official
endpoint, its quota and its terms are known, and it is shown as ready only after a real test.

Last documentation check: **2026-11-04**.

## Rules every source follows

- **No shared key.** EZ-Shop runs on the user's computer. A source that needs a key uses the user's own,
  kept in the system vault (see `docs/CONNECTORS.md`). The app never ships a key.
- **No visit counts invented.** No free official source gives a site's total traffic. EZ-Shop shows a
  *visibility profile* built from indicators, each with its nature, never a number of visits.
- **A failed read is not a zero.** A timeout, a refusal or a quota stop is recorded as such, never as no
  traffic, no stock or a removed product.
- **No billable clicks, no fake orders, no cart tricks** to infer stock or sales.
- **Data nature on every value** (`src/domain/data-nature.ts`):

| Nature | Meaning | Example |
|---|---|---|
| `observed` | Seen by EZ-Shop on the day, on the public page or file | price shown, variant in stock |
| `published` | A measurement published by a third party | CrUX p75 LCP, Ahrefs Domain Rating |
| `declared` | What the site says about itself | JSON-LD availability, "best sellers" order, sitemap dates |
| `provider_estimated` | A model of a provider | estimated search traffic (paid SEO APIs) |
| `ezshop_estimated` | A calculation by EZ-Shop, with its assumptions | sales from reviews |
| `inferred` | An indirect sign, not a measure | "dropshipping app", "young domain" |
| `unknown` | Not available | `DATA_INSUFFICIENT` |

- **Coverage state** of every source read: `available`, `not_covered`, `insufficient_data`,
  `permission_required`, `paid_required`, `rate_limited`, `blocked`, `not_confirmed`, `not_applicable`.

## Access classes

Same classes as `docs/CONNECTORS.md`, applied to these sources:
**A** open, no account · **B** one-click official sign-in (none yet) · **C** the user's own free key or
account · **D** approval or a paid plan required · **E** not usable for EZ-Shop as it stands.

## Integrated

| Source | What it gives | Nature | Access | Checked |
|---|---|---|---|---|
| Shop page + JSON-LD + OpenGraph | name, price, currency, reviews widget, delivery text | observed / declared | A | live, 2026-11-03 |
| Shopify public files (`/products.json`, `/meta.json`, `/collections.json`) | catalogue, variants, stock flags, prices, dates | observed / declared | A | live, 2026-11-03 |
| Shopify Storefront API without token (2026-10) | currencies, languages, countries, best-selling order, price per country | declared / observed | A | live, 2026-11-03 |
| RDAP (bootstrap via rdap.org) | registration date of the domain | published | A | live, 2026-11-03 |
| Internet Archive CDX (`web.archive.org/cdx/search/cdx`) | first capture, months captured | observed (archive) | A | doc 2026-11-04 |
| Tranco list | rank among the top million domains, trend | published | A, **licence caveat** | doc 2026-11-04 |
| Meta Ad Library API | active ads of the shop's name, EU/UK | published | D (developer app + identity check) | live, 2026-11-03 |
| robots.txt + sitemaps | declared URL count, product URL count, last change dates | declared | A | new, this lot |
| HTML/header technology signatures | platform, apps, analytics, payments, with the evidence | observed | A | new, this lot |
| Chrome UX Report API + History API | real-user speed (p75 LCP, INP, CLS), 40 weekly points; presence = enough Chrome traffic to be measured | published | C (free Google Cloud key, 150 req/min/project, free) | doc 2026-11-04 |
| Open PageRank (Keywords Everywhere) | 0–10 authority score, rank, referring domains | published | C (free key, 30 000 domains/month, 100/call) | doc 2026-11-04 |
| Ahrefs `domain-rating-free` | Domain Rating 0–100; attribution "Domain Rating by Ahrefs" required | published | C (free APIv3 key) | doc 2026-11-04 |

**Tranco licence.** The default Tranco list averages Cisco Umbrella, Majestic (CC BY 3.0), CrUX
(CC BY-SA 4.0) and Cloudflare Radar (CC BY-NC 4.0). The non-commercial Radar part makes the default list
fine for the owner's own research and unclear for a commercial product. EZ-Shop keeps it as a personal
research indicator, cites it, and does not redistribute it. To be revisited before any commercial use.

**Open PageRank, Ahrefs.** Their terms of caching are not stated on the pages read. EZ-Shop caches a value
seven days on the user's computer only and never redistributes it.

## Qualified, not integrated (reason)

| Source | What it gives | Why not now |
|---|---|---|
| Google Ads Transparency Center datasets (`bigquery-public-data.google_ads_transparency_center.creative_stats`) | advertiser, verification, creatives, first/last shown, impression bounds per EEA country and Turkey | Needs a Google Cloud project with BigQuery (1 TB/month free, then billed) or downloading very large JSON shards. A per-advertiser query is possible on the user's own project; planned as an optional connector. |
| CrUX on BigQuery, HTTP Archive | monthly history, tech crawl | Same BigQuery cost model; the CrUX API covers the need. |
| Common Crawl (CDXJ index) | older captures of pages | Massive; a targeted index lookup could complement the Internet Archive later. |
| SerpApi (250 searches/month free) | structured search results | Useful for "who ranks on this product"; EZ-Shop already has its own SearXNG. Later. |
| DataForSEO Labs | estimated search traffic, keywords of a domain | Pay-as-you-go (1 USD trial). Optional paid connector, untested. |
| SE Ranking Data API | domains, keywords, backlinks | 100 000 credits for 14 days, then paid. Optional, untested. |
| Similarweb DigitalRank API | rank only, 100 credits/month | Rank, not traffic; adds little to Tranco + CrUX. |
| BuiltWith Free API | technology group counts | Terms restrict products that duplicate BuiltWith; EZ-Shop detects from the page itself. |
| YouTube Data API | channel and video counters | Already a connector for products; competitor channel reading is planned. |
| Instagram Business Discovery | followers and media of business accounts | Needs App Review and a professional account. |
| TikTok Commercial Content API | ads in the EU | Application and approval; commercial eligibility to confirm in writing. Connector exists, not approved. |

## Excluded

| Source | Reason |
|---|---|
| Scrappa / Apify actors re-selling Similarweb or Semrush data | Upstream licence unknown: a working API is not a right to use the data. |
| TikTok Research API | Commercial users not eligible. |
| Reddit Data API | Commercial use needs a written agreement. |
| Semrush Traffic API, Wappalyzer API, OpenAdLibrary business tier | Paid plans only; no free path. |
| Microsoft / Pinterest ad libraries "public APIs" | Not found in official documentation. |

## Marketplaces

The official marketplace APIs (Amazon, AliExpress, Etsy, Walmart, Temu, Allegro, bol, Rakuten,
Cdiscount, Fnac, ManoMano, OTTO, Zalando) were **not qualified** in the research: none is counted as a
connector here. EZ-Shop keeps its two existing ones (eBay Browse with the user's key, AliExpress
affiliate with the user's key). Comparing a product across them goes through entity resolution
(`src/engine/competitor/entity-match.ts`): exact identifier (GTIN), exact reference (brand + MPN/SKU),
strong match, uncertain. A price comparison is never made on an uncertain match.

## Sales and revenue

No free source gives a shop's real orders or revenue. The review-based estimate stays an
`ezshop_estimated` range with its assumed review rate shown; the report never presents it as a measure.
Rank, stock-outs, ad activity, catalogue growth and new countries are `inferred` signals and are never
converted into units sold.

## Validation checklist before a source becomes "integrated"

1. Official, contractual endpoint (not a web interface's private call).
2. Free quota recurring, temporary or demo only.
3. Real data, not a sandbox.
4. Coverage: countries, small domains.
5. Effective date of the data.
6. Measured, estimated or declared fields.
7. Personal key allowed; no shared key.
8. Display allowed; attribution required.
9. Caching and retention allowed.
10. Derived series allowed.
11. Revocation and deletion handled.
12. Cost unit (request, domain, row, credit).
13. Answer for an uncovered domain (must become `not_covered`, never zero).
