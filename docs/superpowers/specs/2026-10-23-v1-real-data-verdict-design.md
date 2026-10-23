# V1 — real data only, simple verdict — design

Date: 2026-10-23. Builds on branch `fix/backend-audit` (backend audit fixes) once it is merged.
Research behind this design: `.superpowers/research/2026-10-19-sources-research.json` (six source families,
probes of 2026-10-19; the adversarial verification pass is still pending, see Open questions).

## Why

The owner wants a local tool that says, before buying or advertising a dropshipping product (usually from Temu,
AliExpress or Alibaba), whether it is worth considering in each target country — with real data only. A useful but
partly limited answer beats an impressive one that lies. EZ-Shop already follows that rule (every value is a sourced
`Datum` or `DATA_INSUFFICIENT`); V1 removes the last fake-data path, adds the product inputs the owner works with, and
turns the result into a plain OUI / NON / À SURVEILLER verdict with its reasons.

## Decisions taken with the owner (2026-10-23, "go" on the recommendations)

1. V1 is built on EZ-Shop, after the backend audit branch is closed.
2. Mock data leaves the product. Synthetic data stays only inside automated tests.
3. Strict ingestion: offline parsing of the supplier URL, the official AliExpress API when the owner has keys, and
   manual entry. The app never fetches Temu, AliExpress or Alibaba pages (their terms forbid automated collection;
   Alibaba and 1688 answer with a captcha).
4. Accounts: AliExpress Open Platform + affiliate first (the owner creates them); Meta, Google Cloud and Microsoft
   Advertising later, optional.
5. eBay and YouTube: show observed listings and videos as they are, with no derived statistic, until their licence
   limits are verified (eBay API License §9.5 / §8.1(d) on price modelling and average selling prices; YouTube API
   policies on aggregated or derived metrics — both reported by research, not yet re-verified).
6. Budget 0 € for V1. No scraping vendor (SerpApi, SearchAPI, Apify…).
7. Countries: the 18 countries already supported (owner gave no list; builder's default, flagged).
8. Three verdicts only. When data is missing the verdict is « À SURVEILLER », with the reason « données insuffisantes ».

## Goals

- A product can be described by: supplier URL and/or product name, category (free text, optional), supplier unit
  price, shipping cost to the customer, target countries, target margin (optional), planned selling price (optional),
  origin country (optional, for duties), HS code (optional).
- The supplier URL is recognised offline: platform and product id for AliExpress (`/item/{id}.html`), Temu
  (`goods_id` parameter or `-g-{id}.html`), Alibaba.com (`_{id}.html`) and 1688 (`/offer/{id}.html`). Short or
  share links (`s.click.aliexpress.com`, `a.aliexpress.com`, `share.temu.com`, `temu.to`) are refused with
  « Lien court : ouvre-le et colle l'adresse finale de la fiche produit. » Nothing is fetched.
- Every value typed by the owner is shown as « saisi par toi » (origin `user`) wherever it is used.
- Per country, the result shows a verdict OUI / NON / À SURVEILLER, one line of reason, and the blocking factors.
- Expert mode keeps the score, its criteria, confidence, sources and limits, and adds a readable source journal.
- No screen, API answer or stored row created after V1 contains synthetic data.

## Non-goals (V1)

AliExpress API ingestion (V1.1, as soon as the owner has keys); Meta / Microsoft ad libraries; the Wikimedia
per-country pageview dataset; Google Trends API alpha; Frankfurter v2; paid providers; authentication and deployment;
regional or city level data (never).

## Anti-goals

- Inventing a market price, a sales volume, a conversion rate or a margin.
- Presenting a proxy (Wikipedia readers, autocomplete suggestions, YouTube results) as searches or sales.
- Saying OUI when the evidence needed for a score is missing.

## Verdict rule

Computed per country from the existing decision and the new blocking factors:

| Existing decision / condition | Verdict | Reason shown |
|---|---|---|
| A blocking factor is known (see below) | NON | the blocking factor |
| `prioritize` (score ≥ 65, confidence ≥ 60) | OUI | strongest supporting signals |
| `avoid` (score < 50, confidence ≥ 40) | NON | weakest criteria |
| `test_carefully` | À SURVEILLER | « signaux mitigés » + main pro and con |
| `exploratory_only` (confidence < 40) | À SURVEILLER | « confiance trop faible » + weakest factor |
| `insufficient_data` (no score) | À SURVEILLER | « données insuffisantes » + sources to connect |

Blocking factors (V1), each only from real inputs:
- loss per unit at the owner's planned selling price, excl. VAT, after duties and shipping (`< 0`);
- planned price below the price the target margin requires (only when both are given);
- no supported national data at all for the country (every demand source failed).

The score, weights and thresholds of `config/scoring.ts` stay unchanged; the verdict is a presentation of them plus
the blocking factors, versioned as `verdict_v1`.

## Margin without invented prices

- Landed unit cost = supplier price + shipping cost + duty per unit (existing duty engine).
- With a planned selling price: margin at that price (labelled « à ton prix »).
- With a target margin: minimum selling price excl. VAT that reaches it (labelled « prix minimum pour ta marge »).
- No margin from marketplace prices in V1 (decision 5). Observed eBay listings are shown as a count plus at most five
  observed asking prices, labelled « prix affichés observés, pas des ventes ».
- Consequence for the score (weights unchanged): the `market_margin` criterion (eBay median price) and the
  `video_interest` criterion (YouTube median views) answer DATA_INSUFFICIENT with the reason « statistique dérivée
  désactivée en attendant la vérification de la licence ». YouTube shows the observed result count and videos only.

## Mock removal

- `dataMode: "mock"` is refused by the input schema; the form control disappears; `providers/mock/` moves to
  `src/test/` and the registry loses its mock branch; `ALLOW_MOCK_DATA` and `MockDataNotAllowedError` go.
- Stored rows are never rewritten: the `data_mode` column and enum stay, and the three existing mock analyses remain
  readable with the existing mock banner (« analyse fictive ancienne »). Deleting them needs the owner's explicit yes.
- The ESLint rule keeps product code from importing test fixtures.

## Source journal

Per analysis, built from what is already stored (sources of every datum, collection issues, provider snapshots): for
each provider, used / failed (with its error code) / not configured / not implemented, per country, with the
collection date. No new table.

## Visual redesign (owner request, 2026-10-24)

The owner approved this V1 design ("Ok") and asked for a full front-end update, with carte blanche on the look within three rules. The look is OLED, there is a dark theme only, and everything is very round, with tasteful animations. A mockup built on the real "casquette" analysis was reviewed on 2026-10-24.

- **Idea: "the verdict first".** The memorable element is a large glowing disc that holds the verdict word. A ring around it fills to the real confidence. It is the only bold element on the page.
- **Colour means verdict.** The base is true black `#000000`. The raised surfaces use these tokens:
  - graphite `#0f0f12` for raised surfaces;
  - ardoise `#1a1a1f` for controls;
  - trait `#232329` for hairlines;
  - brume `#8e8e98` for secondary text;
  - craie `#f4f4f1` for primary text.

  Only the verdict has a hue: OUI is menthe `#4be3a1`, À SURVEILLER is ambre `#ffc24b`, NON is corail `#ff6170`. There are no shadows. Depth comes from the surfaces, plus the verdict's own glow.
- **Type.** Unbounded (500/700) is used only for the product name, the verdict word and the logo. Figtree (400/500/600) is used for everything else, with tabular figures for numbers. There are no all-caps labels, no eyebrows, no arrows appended to buttons and no middle-dot meta strings.
- **Radius hierarchy.** It encodes the role of each element:
  - pills (`9999px`) for controls, chips, buttons and the main input capsule;
  - `32px` for panels;
  - `22px` for tiles inside panels;
  - `14px` for tooltips and menus;
  - circles for the verdict and gauges.
- **Motion.**
  - One orchestrated moment: the verdict reveal. The disc rises, the ring draws to the confidence value, and the reasons appear in sequence, once.
  - Everything else answers an action: "Analyser" becomes a ring loader, segmented controls slide with a spring, panels expand in height, mode switches use View Transitions, numbers count up once and charts draw once when shown.
  - Durations are tokens. `prefers-reduced-motion` removes movement and delays.
- **The light theme is removed**: the toggle, the init script and the light tokens.
- **Layout is responsive** down to 390 px with a 16 px gutter. Two-column areas stack below 900 px. Keyboard focus is always visible.

## Constraints

Country level only; no new dependency without a reason the owner sees; no schema change or migration; strict
TypeScript; French UI copy, English code and docs; tests for every rule (verdict table, URL parser, margin cases,
mock refusal); a real end-to-end check on a copy of the database with open sources only.

## Left to the builder

File layout inside the existing structure, component design (following the current UI), exact wording of reasons
beyond the strings fixed above.

## Open questions (do not block V1)

- Adversarial verification of the research (paused by the owner): run before V1.1 connectors.
- eBay and YouTube licence wording (decision 5) — confirm from the licence texts.
- Whether AliExpress's affiliate app alone gives `aliexpress.affiliate.product.shipping.get` (inferred from the doc
  sample).
