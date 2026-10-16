# Architecture

## Principles

1. **Pre-launch only.** Inputs are external, country-level data. No owner sales, campaigns or analytics.
2. **Country level only.** Every geographic field is an ISO 3166-1 alpha-2 code (enforced by DB `CHECK`s).
3. **No invented numbers.** A value is either a `Known<T>` with sources, or `Insufficient` with a reason.
4. **Separate what is measured from what is assumed.** Kinds: `observed`, `derived`, `estimate`, `assumption`.
5. **Score and confidence are independent.** Never merged, never drawn the same way.

## Layers

```
UI (app/, components/)         server components + 3 client charts, renders Datum<T>
        │
server/ (services, pipeline)   validate → expand terms → collect → analyze → persist
        │                 ╲
engine/ (pure, tested)     providers/ (adapters behind capability contracts)
        │                          │
domain/ (types, Zod schemas) ◄─────┘
```

Dependency rule: `engine/` and `domain/` never import `server/`, `app/` or vendor SDKs.
Providers depend on `domain/` contracts; the registry is the only place that knows concrete classes.

## Core type: `Datum<T>`

```ts
type Datum<T> = Known<T> | Insufficient;

interface Known<T> {
  status: "known";
  kind: "observed" | "derived" | "estimate" | "assumption";
  value: T;
  unit: Unit;
  sources: SourceRef[];      // provider, origin (live | mock | user | config), period, query ref
  method?: string;           // formula / model identifier
  assumptionKeys?: string[]; // hypotheses the value depends on
}

interface Insufficient { status: "DATA_INSUFFICIENT"; reason: string; missing: string[] }
```

`derived()` and `estimate()` merge the sources and assumption keys of their inputs, so provenance
propagates automatically from raw observations to the final score.

## Analysis flow

1. **Validate** input with `analysisInputSchema` (Zod).
2. **Expand terms** (`engine/terms`): normalized input, user synonyms/translations, orthographic variants
   (displayed but not queried — Google Ads already merges close variants; summing them would double count).
   Each country gets terms in one of its languages, or the input term flagged `languageMismatch`.
3. **Collect** (`server/pipeline/collect.ts`): macro providers once (batched), then per country
   (concurrency 3) keyword metrics, search interest, ad libraries, ad cost estimates.
   Every `ProviderResult` failure becomes `Insufficient` + a `CollectionIssue`.
4. **Analyze** (`engine/analyze-country.ts`, pure and seeded):
   - *Demand*: history = Keyword Planner volumes (absolute) or Trends index (relative) or Trends
     calibrated on Keyword Planner. Model: OLS on `log1p(y) = a + b·t + month dummies`.
     Trend from 12 months; seasonality and 12-month forecast from 24 months. P10/P90 from the OLS
     prediction standard error (`σ·√(1 + x₀ᵀ(XᵀX)⁻¹x₀)`).
   - *Competition*: weighted index (Google competition, Meta and TikTok unique advertisers);
     future pressure from the log-linear trend of new ads per week (≥ 8 weeks).
   - *Ad costs*: Google CPC from the top-of-page bid P20–P80 (log-normal), Meta/TikTok from
     CPM ÷ CTR assumption; CPA = CPC ÷ CVR; test budget = CPA × target conversions (Monte Carlo).
   - *Sales potential*: forecast searches × capture share × CVR (5 000 draws), only with an
     absolute demand basis. Revenue requires a user price.
   - *Score* and *confidence* (below).
5. **Persist** (`server/repositories`): analysis, per-country result (JSONB), plus audit tables:
   every raw observation, assumptions, forecasts, score components, competition snapshots.

## Scoring model (`config/scoring.ts`, versioned)

| Criterion | Weight | Normalization |
|---|---:|---|
| Demand volume | 20 | log10 searches/month, 100 → 0, 100 000 → 1 |
| Historical trend | 15 | annual growth −30 % → 0, +50 % → 1 |
| 12-month outlook | 10 | forecast vs last 12 months, −20 % → 0, +30 % → 1 |
| Seasonal timing | 5 | 1–3 months before peak → 1 |
| Current competition | 15 | 1 − index/100 |
| Future competition | 5 | decreasing 1 … surging 0 |
| Ad cost | 10 | Google CPC P50, log, 0.10 → 1, 5.00 → 0 |
| Market context | 10 | GDP/capita PPP (log), internet users, online buyers |
| Unit economics | 10 | CPA P50 / margin, ≤ 0.3 → 1, ≥ 1.2 → 0 |

Rules: weights renormalized over scored criteria; no total below 50 % coverage or without a demand
criterion; total capped at 35 when CPA exceeds margin. Bounds are absolute, so a country's score
does not depend on which other countries are compared.

**Confidence** = coverage × freshness × source quality × cross-source consistency
(Pearson r between Keyword Planner and Trends mapped to (r + 1) / 2; 0.7 with a single demand source).

**Decision**: prioritize (score ≥ 65 and confidence ≥ 60), test carefully (score ≥ 50), avoid,
exploratory only (confidence < 40), insufficient data (no score).

## Extending

**Add a scoring criterion**: implement `Criterion` (`engine/scoring/types.ts`) in
`engine/scoring/criteria.ts`, add its id and weight to `config/scoring.ts` (weights must sum to 100 —
a test asserts it), bump `SCORING_MODEL_VERSION`.

**Add a data source**: pick or add a capability contract in `providers/contracts.ts`, create
`providers/<source>/adapter.ts` with `meta` (access, coverage, verification level, quality tier),
a pure parser tested against a recorded payload, register it in `providers/registry.ts`, add its id
to `PROVIDER_IDS`. Mark it `live_verified` only after a run against the real API.

**Switch to Supabase**: set `DATABASE_URL`, run `npm run db:migrate`. Same schema and migrations as PGlite.

## Database

`products`, `product_terms`, `data_providers`, `analyses`, `country_results`, `observations`,
`assumptions`, `forecasts`, `score_components`, `competition_snapshots`, `provider_cache`.
Schema: `src/server/db/schema.ts`; migrations: `drizzle/`.
