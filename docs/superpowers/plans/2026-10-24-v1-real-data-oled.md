# V1 Real Data + OLED Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship V1 of EZ-Shop. It covers real data only, a plain OUI / NON / À SURVEILLER verdict, the product inputs the owner works with and a source journal, in a new OLED-only, very round, animated interface.

**Architecture:**
- **Domain and engine (pure, tested).** A supplier-URL parser, the V1 input schema, unit economics without invented prices, the verdict rule and the source-journal builder.
- **Server.** Mock providers leave the registry and move to `src/test/`.
- **UI.** A new design system in `globals.css` and the shadcn primitives, then page-by-page rewrites of the shell, home, report, advanced pages, connectors and method.

**Tech Stack:** Next.js 16.4.3 (App Router, cacheComponents), React 19.3, TypeScript 5.9 strict, Tailwind 4, shadcn/radix, Zod 4.6.7, Drizzle 0.45.4 + PGlite 0.5.9, Vitest 3.2.7, Node 22.18.

**Spec:** `docs/superpowers/specs/2026-10-23-v1-real-data-verdict-design.md` (including "Visual redesign").

## Global Constraints

- **Git.**
  - Work on branch `feat/v1-oled` from `main` (`04db035`). Make one local commit per task. Never push and never merge into `main` without the owner.
  - Stage files by name. These stay untracked: `20.9.0`, `Screenshot 2026-10-15 173244.png`, `docs/superpowers/plans/2026-10-16-backend-audit-handoff.md`.
  - Conventional Commits in English, body wrapped at 72. No AI attribution or tool-name lines.
- **Scope.**
  - No new npm dependency. Fonts come through `next/font/google` (Unbounded, Figtree).
  - No schema change or migration. Never rewrite stored rows.
- **Data honesty.**
  - No invented number anywhere. Missing data shows `DATA_INSUFFICIENT` with its reason.
  - Values typed by the owner are shown as « saisi par toi ».
  - Synthetic data exists only under `src/test/`, and no product code imports it.
- **Copy.** UI in French, sentence case. No all-caps labels, no eyebrow labels, no `→` appended to buttons, no « A · B » meta strings. Code and docs in English.
- **Design tokens (spec, verbatim).**
  - Surfaces: noir `#000000`, graphite `#0f0f12`, ardoise `#1a1a1f`, trait `#232329`.
  - Text: brume `#8e8e98`, craie `#f4f4f1`.
  - Verdict: OUI `#4be3a1`, À SURVEILLER `#ffc24b`, NON `#ff6170`.
  - Rules: colour only for the verdict; no shadows; true black base; dark theme only.
  - Radii: pills `9999px`, panels `32px`, tiles `22px`, menus `14px`, circles for verdict and gauges.
- **Motion.**
  - One orchestrated verdict reveal; everything else answers an action.
  - Durations from tokens: fast 140 ms, base 240 ms, slow 480 ms. Ease-out `cubic-bezier(.2,.8,.2,1)`, spring `cubic-bezier(.34,1.56,.64,1)`.
  - `prefers-reduced-motion` gets 1 ms durations and zero delays.
- **Quality floor.**
  - Responsive from 390 px with a 16 px gutter; no horizontal page scroll.
  - Two-column areas stack below 900 px.
  - Visible keyboard focus; WCAG AA contrast.
- **Commands.**
  - Run npm scripts only, because the path contains `&`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
  - Run any build with `PGLITE_DATA_DIR` pointed at a throwaway folder.
- **Database safety.** Tests never open `.data/pglite`. The owner's dev server on port 3001 uses the real database: browse it only, never submit analyses there. Live analyses run only on a copy of the database.

## Review Focus

1. **Old analyses keep rendering.** That includes the 3 stored mock ones (with their banner) and the ones stored before V1 without the new input fields. Pinned in Task 3 (`renders an old mock analysis with its banner`) and Task 10 (`renders a pre-V1 analysis`).
2. **A pasted share or short link** (`s.click.aliexpress.com`, `temu.to`) is refused with the French guidance, never fetched. Pinned in Task 1.
3. **A product typed with only a name** (no prices) still gets a verdict, À SURVEILLER with « données insuffisantes », and never NON from a missing margin. Pinned in Task 5.
4. **API clients still sending `landedCost` or `dataMode: "live"`** keep working. `dataMode: "mock"` gets a clear 400. Pinned in Task 2.
5. **390 px mobile and reduced motion** on the verdict screen: the orb fits, the text wraps and no animation runs. Pinned in Task 13 browser checks.

## Data Safety and Rollback

- There is no migration, and stored rows are only read. The old `dataMode = "mock"` rows remain in the database and still render.
- To roll back one task, revert its commit. To roll back the batch, switch back to `main`, which stays at `04db035`.

---

### Task 0: Branch and documents

- [ ] Create the branch: `git switch -c feat/v1-oled main`.
- [ ] Commit the updated spec and this plan by name: `docs: add V1 real-data and OLED redesign plan`.

### Task 1: Supplier URL parser

**Files:** create `src/domain/supplier-url.ts` and `src/domain/supplier-url.test.ts`.

**Produces:** `parseSupplierUrl(input: string): SupplierUrl`, where:
- `SupplierUrl = { kind: "product"; platform: "aliexpress" | "temu" | "alibaba" | "1688"; productId: string; canonicalUrl: string }`
- `| { kind: "short_link"; message: string }`
- `| { kind: "not_a_supplier_url" }`
- `| { kind: "invalid"; message: string }`

It is pure, with no network access.

**Rules:**
- AliExpress (any subdomain, including `fr.`/`m.`): `/item/{digits}.html`.
- Temu: a `goods_id` query parameter, or `-g-{digits}.html`.
- Alibaba.com: `_{digits}.html`.
- 1688: `/offer/{digits}.html`.
- Short links (`s.click.aliexpress.com`, `a.aliexpress.com`, `share.temu.com`, `temu.to`) give `short_link` with « Lien court : ouvre-le et colle l'adresse finale de la fiche produit. »
- Non-http(s) or malformed input gives `invalid`.
- A plain product name (no URL) gives `not_a_supplier_url`.
- `canonicalUrl` drops the query string, except Temu's `goods_id`.

**Tests:**
- `it.each` with one real-shaped URL per platform, including mobile and locale subdomains.
- Each short-link host.
- `javascript:alert(1)` and `http://` give `invalid`.
- « casquette » gives `not_a_supplier_url`.
- Query tracking parameters are removed from `canonicalUrl`.

- [ ] Write the tests, check that they fail, implement, check that they pass.
- [ ] Run `npm test` and `npm run typecheck`.
- [ ] Commit: `feat(domain): recognise supplier product URLs offline`.

### Task 2: V1 input schema

**Files:** modify `src/domain/schemas.ts`, `src/app/actions.ts` and `src/app/search-form-state.ts`; add tests to `src/domain/schemas.test.ts` and `src/server/pipeline/run-analysis.test.ts`.

**Produces:** `analysisInputSchema` gains these optional fields:
- `supplierUrl`: string ≤ 2000, validated with `parseSupplierUrl`. `short_link` and `invalid` give a field error with their message.
- `category`: user text, 2–60.
- `economics.supplierPrice`: `> 0`, ≤ 100 000.
- `economics.shippingCost`: `≥ 0`, ≤ 100 000.
- `economics.targetMarginPct`: 1–95.

It keeps `sellingPrice` (« prix de vente envisagé ») and `landedCost` as an accepted alias. When `landedCost` is given without `supplierPrice`, it becomes the supplier price and the shipping cost is 0.

`dataMode` accepts only `"live"`, which is also the default. `"mock"` gives the issue « Les données fictives ont été retirées de l'application. ».

The server action reads the new form fields (`supplierUrl`, `category`, `supplierPrice`, `shippingCost`, `targetMarginPct`).

**Tests:**
- Each field's bounds.
- A short link gives the French message on `supplierUrl`.
- A `landedCost`-only payload is still accepted, and economics get `supplierPrice = landedCost`, `shippingCost = 0`.
- `dataMode: "mock"` is rejected with the message, and nothing is written (`listRecent` is empty).

- [ ] TDD as in Task 1. Commit: `feat(domain): accept the V1 product inputs and refuse mock mode`.

### Task 3: Remove mock data from the product

**Files:**
- Move `src/providers/mock/*` to `src/test/mock-providers/`.
- Modify `src/providers/registry.ts`: remove the mock branch, `MockDataNotAllowedError`, and the `mode` parameter if it becomes unused (keep the `ProviderSet.mode = "live"` field shape).
- Modify `src/config/env.ts` (drop `ALLOW_MOCK_DATA` and `isMockAllowed`), `src/server/services.ts`, `src/server/api-response.ts`, `src/app/actions.ts`, `eslint.config.mjs` (the rule now forbids importing `@/test/**` from `src/**` non-test files), `.env.example` and `README.md`.
- Remove the data-mode switch UI (`src/components/search/mode-switch.tsx` and its uses).
- Update every test that used `createProviderSet("mock")` so it injects `createMockProviders` from `src/test/mock-providers` through the existing `providers` seam.

**Behaviour:** a stored analysis whose `dataMode` is `"mock"` still renders, with the banner « Analyse fictive ancienne, créée avant la V1 : ses chiffres ne sont pas réels. ».

**Tests:**
- `renders an old mock analysis with its banner`: a component or server test on the analysis page, or a `toSummary`/repository test that the label is present.
- The existing pipeline tests pass using the injected fixtures.
- A lint test or check proves product code cannot import `@/test/`.

- [ ] Implement, then run the full suite, typecheck and lint.
- [ ] Commit: `refactor: remove mock data from the product, keep fixtures for tests only`.

### Task 4: Unit economics without invented prices

**Files:** modify `src/engine/economics/market-margin.ts`, `src/engine/analyze-country.ts`, `src/engine/signals/indirect.ts`, `src/engine/scoring/criteria.ts` and `src/domain/analysis.ts` (types). Add tests to `src/engine/sources-v2.test.ts` and `src/engine/analyze-country.test.ts`.

**Produces:**
- **Landed cost.** `landedUnitCostEur = supplierPrice + shippingCost + dutyPerUnit`. It is `derived`, with the inputs marked as user assumptions. Without duties, the note says « droits non inclus ».
- **Margin at the owner's price.** `marginAtPlannedPrice`: `(sellingPriceExVat − landed) / sellingPriceExVat` when `sellingPrice` is given. VAT comes from the country rate. Labelled « à ton prix ».
- **Minimum price.** `minPriceForTargetMargin`: `landed / (1 − target)`, excluding VAT, then shown including VAT for the country.
- **No eBay price statistics.** `marketPriceExVatEur` and the market margin are removed. eBay listings keep `total`, at most 5 `observedPrices` and `chinaTotal`. YouTube keeps `totalResults` and the video list, without `medianViews`.
- **Criteria.** `market_margin` and `video_interest` return DATA_INSUFFICIENT with « statistique dérivée désactivée en attendant la vérification de la licence ». Weights in `config/scoring.ts` are unchanged. Bump `SCORING_MODEL_VERSION` to `"2026.10-v3"`.

**Tests:**
- Landed cost with and without duties.
- Margin at the planned price, including a negative margin.
- Minimum price for a 40 % target.
- No price, so the margins are DATA_INSUFFICIENT.
- The two criteria are insufficient with that reason.
- Weights still sum to 100.

- [ ] TDD. Commit: `feat(engine): compute margins only from real inputs, drop derived marketplace statistics`.

### Task 5: Verdict rule `verdict_v1`

**Files:** create `src/engine/report/verdict.ts` and `src/engine/report/verdict.test.ts`. Modify `src/engine/report/simple-summary.ts` so it uses the new verdict; drop `VerdictLevel` and the old titles.

**Produces:**
- `verdictFor(c: CountryAnalysis): Verdict`, where `Verdict = { value: "oui" | "non" | "surveiller"; label: "OUI" | "NON" | "À SURVEILLER"; reason: string; blocking: readonly BlockingFactor[]; supporting: readonly string[]; method: "verdict_v1" }`.
- `BlockingFactor = { id: "loss_at_planned_price" | "below_target_margin" | "no_demand_data"; message: string }`.

**Rule (spec table):**
- Any known blocking factor gives NON.
- `prioritize` gives OUI.
- `avoid` gives NON.
- `test_carefully` gives À SURVEILLER, « signaux mitigés ».
- `exploratory_only` gives À SURVEILLER, « confiance trop faible ».
- `insufficient_data` gives À SURVEILLER, « données insuffisantes ».

A missing margin is never a blocking factor.

**Tests:**
- One case per row.
- A name-only product gives À SURVEILLER, « données insuffisantes », with no blocking factor.
- A loss at the planned price gives NON, even when the score is high.
- A planned price below the target gives NON with the minimum price in the message, taken from Task 4 values.

- [ ] TDD. Commit: `feat(engine): add the OUI / NON / À SURVEILLER verdict rule`.

### Task 6: Source journal

**Files:** create `src/engine/report/source-journal.ts` and its test.

**Produces:** `sourceJournal(analysis: AnalysisResult): JournalRow[]`, where `JournalRow = { providerId; name; countries: CountryCode[]; status: "used" | "failed" | "not_configured" | "not_implemented"; errorCode?: string; collectedAt?: string }`.

It is built only from the stored `sources`, `issues` and `providers` snapshots, with no new table.

**Tests:**
- An analysis with a used source, a failed one (with code), a not-configured one and a not-implemented one.
- A pre-V1 analysis (no context column) still builds.

- [ ] TDD. Commit: `feat(engine): build a readable source journal from stored provenance`.

### Task 7: Design system, OLED only

**Files:**
- Modify `src/app/globals.css`: replace the theme tokens with the spec tokens, add radius and motion tokens, add a reduced-motion block, and remove light-theme rules and `data-theme` branches.
- Modify `src/app/layout.tsx`: use Unbounded and Figtree through `next/font/google`, and remove the theme init script.
- Remove `src/components/layout/theme.ts` and `theme-toggle.tsx` and their uses.
- Restyle the radius of every `src/components/ui/*` primitive to the hierarchy: buttons, badges, inputs and select triggers become pills; cards and panels use 32px; menus, tooltips and popovers use 14px.

**Tests and checks:**
- `npm run typecheck`, `npm run lint` and `npm test` pass.
- Visual check by the controller: screenshots at 1280 px and 390 px of home and an existing report on the owner's server.
- `grep` finds no `prefers-color-scheme: light`, `data-theme` or `.light` left.

- [ ] Commit: `feat(ui): OLED-only design system with round shapes and motion tokens`.

### Task 8: App shell and navigation

**Files:** `src/components/layout/app-shell.tsx`, `nav-link.tsx`, `mode-toggle.tsx`, and `src/app/template.tsx` if needed.

**Behaviour:**
- **Simple mode.** A top bar with the pill logo (Unbounded) and a « Mode avancé » pill.
- **Advanced mode.**
  - Desktop: a floating rounded rail on the left with pill items (Nouvelle analyse, Analyses récentes, Sources de données, Méthode) and the active item filled.
  - Mobile: a bottom pill bar.
  - The mode switch uses a View Transition, and plain state when motion is reduced.

**Checks:** browser at 1280 and 390 px, keyboard Tab order and focus rings, no console error.

- [ ] Commit: `feat(ui): round shell and navigation for both modes`.

### Task 9: Home and forms

**Files:** `src/components/search/simple-search.tsx`, `search-form.tsx`, `country-picker.tsx` and `recent-analyses.tsx`.

**Behaviour:**
- **Capsule input** (`Nom du produit ou lien de la fiche`). When the value is a supplier URL, a chip under it shows the platform and the product id (e.g. « AliExpress, article 1005006… »). A short link shows the French guidance inline. The product name field stays required when no URL is recognised; with a URL, the name defaults to « Produit {platform} {id} » until the owner types one.
- **France / Monde entier** segmented control with a spring thumb.
- **« Prix et livraison » pill.** It opens an animated drawer with supplier price, shipping cost, planned selling price, target margin, category, origin country and HS code. Each field has a help line and keeps its value.
- **« Analyser » button.** It morphs into a ring loader with « Analyse en cours » while pending, and the label never wraps. Errors appear in an inline rounded alert.
- **Advanced form** with the same fields in grouped round panels. The mock switch is gone.

**Checks:**
- Server action round-trip in a unit test of the action's parsing, if one exists.
- Browser: type a short link, see the guidance, without submitting.

- [ ] Commit: `feat(ui): capsule search with supplier links and price details`.

### Task 10: Simple report with the verdict orb

**Files:** `src/components/analysis/simple-report.tsx`. Create `src/components/analysis/verdict-orb.tsx`, `reason-pills.tsx` and `source-journal.tsx`. Modify `src/components/country/demand-chart.tsx` (styling and draw-on).

**Behaviour:**
- **Orb.** It shows `verdict.label` in Unbounded, with an SVG ring drawn to `confidence.score %` and a glow in the verdict colour.
- **Reveal.** The orb rises, the ring draws, and the reason pills (blocking factors first, in their colour) appear in sequence, once per page view.
- **Panels.**
  - A figures panel with 4 cells and count-up numbers.
  - « Archives : l'intérêt mois par mois », where the observed line draws once and the projection is dashed.
  - « Pour obtenir un vrai verdict », listing the missing sources by weight with pill links to Sources de données.
  - « Ta marge », shown only when prices were entered: landed cost, margin at the owner's price, minimum price for the target.
  - « Journal des sources », collapsible.
- **World mode.** The country table becomes rounded rows with a small verdict dot per country.

**Tests:** `renders a pre-V1 analysis`: a render test, or a test that `verdictFor`, `sourceJournal` and the report props accept a stored pre-V1 result fixture.

**Checks:** browser on an existing report at 1280 and 390 px, with reduced motion emulated.

- [ ] Commit: `feat(ui): verdict orb report with margin and source journal`.

### Task 11: Advanced analysis and country pages

**Files:** `src/app/analyses/[id]/page.tsx`, `src/app/analyses/[id]/[country]/page.tsx`, and `src/components/analysis/*` and `src/components/country/*` (except files rewritten in Task 10).

**Behaviour:**
- The same tokens and radius hierarchy everywhere.
- The orb in compact size on the country page.
- Score breakdown bars as round pills.
- Tables in rounded containers, keeping the sticky country column.
- Provenance and assumptions in round disclosures.
- eBay shows observed listings, with at most 5 prices labelled « prix affichés observés, pas des ventes ». YouTube shows the result count.

**Checks:** browser screenshots, no horizontal scroll at 390 px except inside tables.

- [ ] Commit: `feat(ui): restyle the expert analysis and country pages`.

### Task 12: Connectors and method pages

**Files:** `src/app/connectors/page.tsx`, `src/components/connectors/*`, `src/app/methodology/page.tsx` and `src/components/methodology/*`.

**Behaviour:**
- Round source cards grouped as today. Status dots use neutral hues (state colours are allowed here because they are not verdicts: use craie and brume plus one ambre for « à réparer »).
- The dialog is a 32px sheet that slides up on mobile.
- The method page gains the `verdict_v1` table.

- [ ] Commit: `feat(ui): restyle sources and method pages`.

### Task 13: Final verification

- [ ] Run `npm run check` (record counts), `npm run test:coverage` (record totals) and the build with a throwaway `PGLITE_DATA_DIR`. Report exit codes.
- [ ] On a fresh copy of `.data/pglite` with Google Ads forced off (`GOOGLE_ADS_REFRESH_TOKEN=' '`), run one real analysis with open sources only, on port 3100: a product name plus a supplier price and shipping cost.
- [ ] Browser checks, each at 1280 and 390 px, with screenshots: home (empty, typing a URL, details open, pending), simple report (France, world), advanced analysis, country page, sources, method.
- [ ] Check no console errors, reduced-motion emulation and keyboard focus.
- [ ] Final whole-branch review on the most capable model; one fix wave and one re-review.
- [ ] Report to the owner: commits, checks, screenshots, limits. Merge only with the owner's yes.
