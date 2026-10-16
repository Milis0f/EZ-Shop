# EZ-Shop — pre-launch product research

Estimate the commercial potential of a product **before launch**, country by country, from external
data only. No shop sales, ad history, Pixel or Analytics data is ever used.

Every number carries its epistemic status (**observed**, **derived**, **estimate**, **assumption**)
and its sources. When an honest estimate is impossible the app shows `DATA_INSUFFICIENT` — never a
placeholder value.

## Quick start

Requirements: Node ≥ 20.9 (Node 24 LTS recommended, see [Known limitations](#known-limitations)).

```bash
npm install
npm run dev
```

Open http://localhost:3000. No database server, Docker or API key is needed:

- the database is an embedded **PGlite** (Postgres in WASM) stored in `.data/pglite`, migrated on first use;
- World Bank, Eurostat and OECD are queried live (open APIs, no key);
- key-based sources stay "not configured" and their indicators show `DATA_INSUFFICIENT`;
- tick **Données fictives de développement** in the form to fill every screen with synthetic data (development only).

> Scripts call binaries through `node node_modules/...` on purpose: npm's Windows `.cmd` shims break
> when the project path contains `&` (as in `Claude & IA`).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / server |
| `npm run check` | Typecheck + lint + tests |
| `npm test` / `npm run test:coverage` | Vitest unit and integration tests |
| `npm run db:generate` | Generate a SQL migration from `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (Postgres/Supabase when `DATABASE_URL` is set, PGlite otherwise) |
| `npm run db:studio` | Drizzle Studio |

## Configuration

Copy `.env.example` to `.env.local`. Secrets never go in the code.

In development, connector credentials can also be entered from **Sources de données → Configurer**: the form writes
the connector's variables to `.env.local` and applies them without a restart. Values are validated, never logged and
never sent back to the browser. The form is disabled in production and for requests not addressed to `localhost`;
it then shows the lines to add by hand.

| Source | Access | State in this repo |
|---|---|---|
| World Bank Indicators | open | implemented, verified live |
| Eurostat (online buyers) | open | implemented, verified live |
| OECD (consumer confidence) | open | implemented, verified live (SDMX-ML) |
| Google Ads Keyword Planner | OAuth; Basic access on the Google Cloud project (developer tokens sunset 2026-09-09) | implemented from the docs, **not yet verified** with real credentials; "Tester la connexion" checks a setup live |
| Meta Ad Library | verified developer token | implemented from the docs, **not yet verified** |
| TikTok Commercial Content | approved research app | implemented from the docs, **not yet verified** |
| Google Trends API (alpha) | on application | contract only (`TODO(google-trends)`) |
| Meta Marketing / TikTok Business estimates | ad account | contract only |
| Google Autocomplete | open, **unofficial endpoint** | implemented, verified live; related searches and purchase intent per country, no volume |
| Wikipedia pageviews + Wikidata | open | implemented, verified live; category interest per language edition (trend/seasonality fallback, never searches) |
| GOV.UK Trade Tariff (`/uk` GB, `/xi` = EU tariff) | open (rate limited) | implemented, verified live; HS classification, duties by origin, EU €3 low-value duty |
| USITC HTS | open | implemented, verified live; US duties by HS code, chapter 99 flagged not computed |
| VAT rates (vatcomply + official references) | open | implemented, verified live (EU-27); GB/CH/CA/AU/US transcribed from tax authorities |
| ECB reference FX (Frankfurter) | open | implemented, verified live |
| YouTube Data API v3 | Google Cloud API key | implemented from the docs, **not yet verified** |
| eBay Browse API | free developer account | implemented from eBay's OpenAPI spec, **not yet verified** |
| AliExpress Affiliate API | free affiliate account + app approval | implemented from the docs (signature checked on official vectors), **not yet verified** |

Every keyed source has a step-by-step guide and a live connection test in **Sources de données → Configurer**.
Import duties (by origin country) enter the unit cost, the margin and the score. Plan and verified facts:
[`docs/PLAN-sources-v2.md`](docs/PLAN-sources-v2.md).

The `/connectors` page shows the live state of each source.

### Supabase / Postgres

Set `DATABASE_URL` (Supabase: use the pooled connection string), then:

```bash
npm run db:migrate
```

## Data modes

- **live** — real connectors only. Missing sources ⇒ `DATA_INSUFFICIENT`.
- **mock** — synthetic, deterministic fixtures from `src/providers/mock/`, for visual development.
  Every mock value is tagged `origin: "mock"`, shown with a hatched magenta marker and a page banner.
  Mock mode is refused in production (`NODE_ENV=production` or `ALLOW_MOCK_DATA=false`), and an ESLint
  rule forbids importing mock code anywhere except the provider registry.

## Project structure

```
src/
├── app/            pages (search, analysis, country detail, connectors, method) + API routes + server action
├── components/     ui/ (shadcn), layout/, data/ (Datum rendering), analysis/, country/, search/
├── config/         env (Zod), scoring model (weights, bounds, thresholds), default assumptions
├── domain/         types and Zod schemas — Datum, provenance, countries, analysis
├── engine/         pure functions: demand model, competition, ad costs, sales simulation, scoring, confidence
├── providers/      one adapter per source behind capability contracts, registry, mock fixtures
├── server/         DB (Drizzle), repositories, analysis pipeline, services, rate limiting
└── lib/            formatting, seeded RNG, utilities
drizzle/            SQL migrations
docs/ARCHITECTURE.md
```

## API

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/analyses` | Run an analysis. Body: see `src/domain/schemas.ts` |
| `GET` | `/api/analyses` | Recent analyses |
| `GET` | `/api/analyses/:id` | Full analysis with provenance |
| `GET` | `/api/connectors` | Connector states (no secrets) |

Responses use `{ success, data, error }`.

## Known limitations

- **Node 20.17 is end-of-life** (April 2026). Tooling is pinned to Node-20-compatible versions
  (Vitest 3, ESLint 9, Vite 6); `npm audit` reports advisories in those dev-only tools. Upgrading to
  Node 24 LTS allows Vitest 5 / ESLint 10 and clears them. Nothing affected ships in the runtime bundle.
- Analyses run synchronously in the request (`TODO(jobs)`: background jobs once live connectors are slow).
- Revenue uses a single input currency (EUR); per-country FX conversion is a TODO.
- Multilingual terms come from the user; automatic translation/synonyms (`TODO(llm-expansion)`) and
  Keyword Planner ideas (`TODO(google-ads-ideas)`) are not implemented.
- Competition history is stored per run (`competition_snapshots`) but the projection currently uses
  the weekly launch dates exposed by ad libraries.
