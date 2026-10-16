# Backend Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eight backend reliability and safety problems approved after the 2026-10-16 audit, without changing deployment, schema or dependencies.

**Architecture:** Changes stay inside the existing layers: the shared HTTP/cache helpers (`src/providers/http.ts`), the adapters that call them, the analysis pipeline and repositories (`src/server/`), the demand model (`src/engine/demand/`) and the input schema (`src/domain/schemas.ts`). Two small new modules: `src/lib/storage-safe.ts` (text Postgres accepts) and `src/providers/shared-result.ts` (one in-flight request per shared value). A test-only helper opens an in-memory PGlite with the real migrations.

**Tech Stack:** Next.js 16.4.0, TypeScript 5.9 strict, Zod 4.6.7, Drizzle ORM 0.45.4, PGlite 0.5.9, Vitest 3.2.7, Node 20.17.

**Spec:** `docs/superpowers/specs/2026-10-16-backend-audit-fixes-design.md`

## Global Constraints

- Work on branch `fix/backend-audit` created from `78d531e`. Commit locally after each task. Never push, never merge into `main`.
- Stage files by name (`git add <paths>`). Never `git add .` or `-A`: `20.9.0` and `Screenshot 2026-10-15 173244.png` must stay untracked.
- Commit messages: Conventional Commits in English, body explains why. No AI attribution or co-author lines.
- No new dependency, no change to `src/server/db/schema.ts`, no file in `drizzle/`, no deployment or infrastructure change.
- Tests never open `.data/pglite` and never touch the network (stub `fetch` with `vi.stubGlobal`, as in `src/providers/adapters-http.test.ts`).
- Never read, print or log `.env.local` values, secrets, cache payloads or request bodies.
  - New logs carry a provider id, an operation and controlled diagnostics only: error name and SQLSTATE code, through `describeStorageError`.
  - Never a raw message from an external service or the database.
- Outside tests, no analysis may call a real API or spend a quota. Before running one, state whether it uses mocks, cache or real APIs.
- Context7: use `resolve-library-id` and `query-docs` when a decision depends on library behaviour. Report the library version you documented against when it differs from the installed one.
- Code, comments and docs in English; user-facing messages in French.
- Do not delete tests or weaken assertions. If an existing assertion must change, stop and report why.
- Run scripts through npm (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`): the project path contains `&`, which breaks the `.cmd` shims.
- `DATA_INSUFFICIENT` and Datum rules stay as they are: no fallback value is invented anywhere.

## Review Focus

1. **Legacy invalid cache entries.** A poisoned entry already stored must be skipped on read and replaced by the next valid answer. Pinned in Task 2, `cached > ignores an invalid entry already in the cache and replaces it`.
2. **API clients sending `application/json; charset=utf-8`, or no `Origin` header (curl).** Both must still be accepted. Pinned in Task 5, `checkJsonPost` table.
3. **A token request that fails while several countries wait on it.** Every waiter gets the failure, and the next analysis retries instead of reusing it. Pinned in Task 4, `GoogleAdsKeywordPlannerProvider > retries the token after a shared failure`.
4. **Pasted multi-line product names** from the simple-mode textarea. They must be normalised, not rejected. Pinned in Task 8, `analysisInputSchema > turns tabs and line breaks into single spaces`.
5. **Series arriving unsorted.** The model must sort before measuring time. Pinned in Task 6, `fitDemandModel > gives the same model for unsorted input`.

## Data Safety and Rollback

- No task changes the schema, adds a migration or rewrites stored rows.
  - Stored analyses keep their values and their `_v1` method ids.
  - Cached entries stay until they expire. Task 2 skips the invalid ones on read and overwrites them with the next valid answer.
- Tests open only in-memory PGlite instances. The live check in Task 9 runs on a copy of `.data/pglite`, so the real database is never written.
- Rollback:
  - one task: `git revert <sha>`;
  - the whole batch: `git switch main`, since `main` stays at `78d531e`.

---

### Task 0: Branch and planning documents

**Files:**
- Add: `docs/superpowers/specs/2026-10-16-backend-audit-fixes-design.md`, `docs/superpowers/plans/2026-10-16-backend-audit-fixes.md` (already written, untracked)

- [ ] **Step 1: Create the branch**

Run: `git switch -c fix/backend-audit 78d531e`
Expected: `Switched to a new branch 'fix/backend-audit'`; `git status --short` lists only the two docs, `20.9.0` and the screenshot.

- [ ] **Step 2: Commit the documents**

```bash
git add docs/superpowers/specs/2026-10-16-backend-audit-fixes-design.md docs/superpowers/plans/2026-10-16-backend-audit-fixes.md
git commit -m "docs: add backend audit design and implementation plan"
```

---

### Task 1: Integration tests for the database layer (characterisation)

Pins today's persistence behaviour before anything else changes. Coverage problem 4.

**Files:**
- Create: `src/test/pglite.ts`
- Create: `src/server/repositories/drizzle-repositories.test.ts`
- Modify: `vitest.config.mts` (coverage `include`: add `"src/server/repositories/**"`)

**Interfaces:**
- Produces: `createTestDatabase(): Promise<{ db: Database; close(): Promise<void> }>` in `src/test/pglite.ts`. It opens `new PGlite()` (in memory), wraps it with `drizzle(client, { schema })` from `drizzle-orm/pglite`, runs `migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })` from `drizzle-orm/pglite/migrator`, and casts to `Database` (from `@/server/db/client`) as `src/server/db/client.ts` does.
- Produces: `truncateAll(db: Database): Promise<void>`, same file: `TRUNCATE analyses, products, data_providers, provider_cache CASCADE`.

- [ ] **Step 1: Write the tests**

One database per file (`beforeAll(..., 30_000)`), `truncateAll` in `beforeEach`, `close()` in `afterAll`. Repositories: `new DrizzleAnalysisRepository(db)` and `new DrizzleCacheRepository(db)`. Pipeline input: the mock-mode `input` and `devEnv` / `NOW` used in `src/server/pipeline/run-analysis.test.ts`.

```ts
it("applies every migration, including the analyses.context column", ...)
// information_schema.columns has (analyses, context) with data_type "jsonb"

it("persists a mock analysis and reads it back unchanged", ...)
// const result = await runAnalysis(input, { repositories, env: devEnv, now: () => NOW });
// expect(await repositories.analyses.findById(result.id)).toEqual(result);

it("writes the audit rows of a completed analysis", ...)
// country_results: 3 rows; score_components > 0; forecasts > 0; assumptions = result.assumptions.length;
// observations > 100, all origin "mock"; competition_snapshots has no "US" row; analyses.status = "completed"

it("rolls back every audit row when one is rejected", ...)
// create(...) then complete({ ...valid, observations: [{ ...validObservation, country: "fr" as CountryCode }] })
// rejects (ISO2 CHECK); country_results count for that id = 0; status still "running"

it("lists recent analyses newest first with their best scored country", ...)
// two runs, the second with now = NOW + 1 min: listRecent(1)[0].id = second id; topCountry is the highest score

it("records a failure with the message cut at 2 000 characters", ...)
// fail(id, "x".repeat(3000)) → findById: status "failed", error length 2000, completedAt defined

it("keeps one product row and unique terms across runs", ...)
// two runs of the same input → 1 row in products, no duplicate (product_id, term, language) in product_terms

it("returns a cached payload until it expires, and upserts on write", ...)
// set(k, "p", {a: 1}, 60); set(k, "p", {a: 2}, 60) → get(k) = {a: 2}; set(k2, "p", {}, -1) → get(k2) = null
```

If `findById` does not equal `result`, that is a finding: debug it with superpowers:systematic-debugging and report it before changing any assertion.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/server/repositories/drizzle-repositories.test.ts`
Expected: PASS. These tests describe current behaviour, so a failure is a defect to report, not a reason to adjust the test.

- [ ] **Step 3: Add the repositories to coverage and run the full suite**

Run: `npm run test:coverage`
Expected: all tests pass, and the table now has rows for `server/repositories`.

- [ ] **Step 4: Commit**

```bash
git add src/test/pglite.ts src/server/repositories/drizzle-repositories.test.ts vitest.config.mts
git commit -m "test: cover Drizzle repositories with real migrations on in-memory PGlite"
```

---

### Task 2: Cache only payloads the adapter validates

Problem 1.

**Files:**
- Modify: `src/providers/http.ts` (`cached`, lines 110-122)
- Modify, one validity predicate per call site:
  - `src/providers/google-autocomplete/adapter.ts`
  - `src/providers/customs/uk-trade-tariff.ts`, `src/providers/customs/uk-tariff-parse.ts`
  - `src/providers/customs/usitc.ts`
  - `src/providers/eurostat/adapter.ts`, `src/providers/world-bank/adapter.ts`, `src/providers/oecd/adapter.ts`
  - `src/providers/reference/ecb-fx.ts`, `src/providers/reference/vat-rates.ts`
  - `src/providers/translation/mymemory.ts`
  - `src/providers/wikimedia/adapter.ts`, `src/providers/youtube/adapter.ts`, `src/providers/ebay/adapter.ts`, `src/providers/aliexpress/adapter.ts`
- Test: `src/providers/adapters-http.test.ts`, `src/providers/sources-v2.test.ts`

**Interfaces:**
- Produces:

```ts
export async function cached<T>(
  cache: ProviderCacheRepository, key: string, providerId: string, ttlSeconds: number,
  load: () => Promise<ProviderResult<T>>,
  isValid: (payload: T) => boolean,
): Promise<ProviderResult<T> & { fromCache?: boolean }>
```

  - A hit is returned only when `isValid(hit)`. Otherwise it counts as a miss.
  - A loaded payload is stored only when `result.ok && isValid(result.data)`.
  - An invalid loaded payload is still returned, so the adapter's parser reports the error.
  - `isValid` is required, so every call site has to decide.

- Predicates. Each one is true for the expected shape *without* an error envelope:

  | Call site | Predicate |
  |---|---|
  | Autocomplete | `(p) => parseSuggestions(p).ok` |
  | UK Trade Tariff | `isTariffDocument(payload: unknown): boolean`, exported from `uk-tariff-parse.ts`. True for an object with a `data` member and no `errors` member. |
  | USITC | `isUsitcPayload(payload: unknown): boolean`. `z.array(rowSchema)` succeeds. |
  | Eurostat | `isJsonStat(payload: unknown): boolean`. `jsonStatSchema` succeeds. |
  | World Bank | `isWorldBankData(payload: unknown): boolean`. The 2-element tuple of `responseSchema` (the `[{ message }]` form is false). |
  | OECD | `(p) => parseOecdGenericXml(p, url, now).ok` |
  | ECB FX | `(p) => schema.safeParse(p).success` |
  | VAT | `(p) => parseVatRates(p).ok` |
  | MyMemory | `isCacheableTranslation(payload: unknown): boolean`. True when `parseMyMemory` succeeds or fails with `no_data` (an uncertain or empty translation is a stable answer). False for `rate_limited` (quota) and `upstream_error`. |
  | Wikimedia | `get(url, label, isValid)` gains the predicate. Exported `isTitleBatch`, `isPageviews` and `isWikidataEntities` use `batchSchema`, `viewsSchema` and the entities schema of `parseSitelink`. |
  | YouTube | `call(path, params, label, fresh, isValid)` gains the predicate: `searchSchema` for `/search`, `videosSchema` for `/videos`. |
  | eBay | `(p) => searchSchema.safeParse(p).success` |
  | AliExpress | `(p) => parseAliExpress(p).ok` |

- [ ] **Step 1: Write the failing tests**

In `adapters-http.test.ts`, `describe("cached")`:

```ts
it("does not store a payload the adapter rejects", ...)
// load returns ok({ error: true }), isValid = () => false → the result is returned and cache.get(key) is null
it("ignores an invalid entry already in the cache and replaces it", ...)
// cache.set(key, ..., { stale: true }); isValid rejects it; load returns { fresh: true } → result fresh, cache now { fresh: true }
it("serves a valid entry without loading", ...)
// load is a vi.fn → not called, fromCache: true
```

Then one test per affected provider (stubbed fetch, `MemoryCacheRepository`), each calling twice and asserting the second call fetches again:

```ts
it("MyMemory: a quota warning is not cached", ...)
// 1st fetch: { responseStatus: 200, quotaFinished: true, responseData: { translatedText: "MYMEMORY WARNING…" } }
//   → rate_limited
// 2nd fetch: a valid translation → ok; fetch called 2 times
it("AliExpress: an error_response is not cached", ...)
// error_response, then a valid response → second call ok, fetch called 2 times
it("World Bank: a message envelope is not cached", ...)
// [{ message: [{ id: "120", value: "Invalid value" }] }], then valid rows → second call ok
it("Wikimedia: a well-formed title lookup without a match stays cached", ...)
// no match → no_data both times, fetch called 1 time (shape-valid answers remain cacheable)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/providers/adapters-http.test.ts src/providers/sources-v2.test.ts`
Expected: the new `cached` tests and the MyMemory / AliExpress / World Bank tests FAIL (fetch called 1 time). The Wikimedia test passes.

- [ ] **Step 3: Add `isValid` to `cached` and the predicates at every call site**

Run: `npm run typecheck`
Expected: no error. A call site without a predicate does not compile.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/providers/http.ts src/providers/*/adapter.ts src/providers/customs/*.ts src/providers/reference/*.ts src/providers/translation/mymemory.ts src/providers/adapters-http.test.ts src/providers/sources-v2.test.ts
git commit -m "fix(providers): cache only payloads the adapter validates"
```

---

### Task 3: Non-blocking cache and storage-safe text

Problem 2.

**Files:**
- Create: `src/lib/storage-safe.ts`, `src/lib/storage-safe.test.ts`
- Modify: `src/providers/http.ts` (`httpJson` uses the safe parser; `cached` catches cache errors)
- Test: `src/providers/adapters-http.test.ts`, `src/server/repositories/drizzle-repositories.test.ts`

**Interfaces:**
- Produces, in `src/lib/storage-safe.ts`:
  - `toStorageSafeText(value: string): string`. Removes U+0000 and replaces lone surrogates with U+FFFD (`String.prototype.toWellFormed`).
  - `parseJsonForStorage(text: string): unknown`. Same as `JSON.parse`, with string values and object keys passed through `toStorageSafeText`.
    - **Key collisions are explicit:** when two keys of one object become equal after sanitising (`"a\u0000"` and `"a"`), it throws `UnsafeJsonKeysError` (exported). Keys are never merged silently.
    - **Special keys stay data:** sanitised objects are rebuilt with `Object.fromEntries`, never with `obj[key] = value`, so `"__proto__"` stays an own property and no prototype changes.
  - `httpJson` maps `UnsafeJsonKeysError` to `fail("invalid_response", "<label>: response keys are not storable")`.
- `describeStorageError(error: unknown): string`, same file. It returns only controlled diagnostics: the error's `name` when it matches `/^[A-Za-z]{1,40}$/`, plus its `code` when it matches the SQLSTATE form `/^[0-9A-Z]{5}$/` (e.g. `"error (code 22P05)"`). Never the message.
- Consumes: `createTestDatabase` (Task 1).
- `cached` behaviour:
  - When `cache.get` throws, it counts as a miss.
  - When `cache.set` throws, the loaded result is still returned.
  - Both log `console.warn("[cache] <providerId> <read|write> failed: <describeStorageError(error)>")`. Never the raw message, the payload or the key.

- [ ] **Step 1: Write the failing tests**

```ts
// storage-safe.test.ts
it("removes NUL and replaces lone surrogates", ...)
// toStorageSafeText("a\u0000b\ud800c") === "ab�c"; "é ❄️" unchanged
it("sanitises values and keys while parsing JSON", ...)
// parseJsonForStorage('{"t":"a\\u0000b","\\u0000k":["\\ud800"]}') toEqual { t: "ab", k: ["�"] }
it("refuses keys that collide once sanitised", ...)
// '{"a\\u0000":1,"a":2}' → throws UnsafeJsonKeysError; nested object with the collision → throws too
it("keeps __proto__ as plain data", ...)
// '{"__proto__":{"polluted":true},"x\\u0000":1}' → Object.hasOwn(r, "__proto__") === true,
// Object.getPrototypeOf(r) === Object.prototype, ({} as any).polluted === undefined, r.x === 1
// '{"__proto__\\u0000":1,"__proto__":2}' → throws UnsafeJsonKeysError
it("describes storage errors without their message", ...)
// describeStorageError(Object.assign(new Error("token SECRET-TOKEN-123 in payload"), { code: "22P05" }))
//   === "Error (code 22P05)"; a code like "x; drop" is left out; a non-Error value gives "unknown error"

// adapters-http.test.ts
it("httpJson returns storage-safe strings", ...)
// stub body '{"title":"x\\u0000y"}' → data.title === "xy"
it("httpJson reports colliding keys as an invalid response", ...)
// body '{"a\\u0000":1,"a":2}' → { ok: false, error: { code: "invalid_response" } }
it("cached still answers when the cache read throws", ...)
it("cached still answers when the cache write throws", ...)
// cache.get / cache.set reject with new Error("db down: payload SECRET-TOKEN-123") → result ok with the loaded data;
// console.warn called once; its joined arguments contain "[cache]" and the provider id,
// and contain neither "SECRET-TOKEN-123", nor "db down", nor any payload value

// drizzle-repositories.test.ts
it("stores a provider payload once it went through httpJson", ...)
// raw object { t: "a\u0000b" } → cache.set rejects (documents the Postgres rule);
// parseJsonForStorage of the same JSON → cache.set resolves and get returns { t: "ab" }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/lib/storage-safe.test.ts src/providers/adapters-http.test.ts src/server/repositories/drizzle-repositories.test.ts`
Expected: FAIL (module missing; the `cached` tests reject with "db down").

- [ ] **Step 3: Implement `storage-safe.ts`, use it in `httpJson`, and catch cache errors in `cached`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage-safe.ts src/lib/storage-safe.test.ts src/providers/http.ts src/providers/adapters-http.test.ts src/server/repositories/drizzle-repositories.test.ts
git commit -m "fix(providers): keep analyses running when the cache fails and store only Postgres-safe text"
```

---

### Task 4: Share in-flight token and lookup requests

Problem 3.

**Files:**
- Create: `src/providers/shared-result.ts`, `src/providers/shared-result.test.ts`
- Modify:
  - `src/providers/google-ads/adapter.ts` (`accessToken`, `currency`, `languages`, and the resets in `diagnose`)
  - `src/providers/ebay/adapter.ts` (`token`, and the reset in `diagnose`)
  - `src/providers/tiktok-commercial/adapter.ts` (`token`)
- Test: `src/providers/adapters-http.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SharedResult<T> { get(): Promise<ProviderResult<T>>; reset(): void }
export function sharedResult<T>(
  load: () => Promise<ProviderResult<T>>,
  options?: { ttlMs?: (value: T) => number; now?: () => number },
): SharedResult<T>
```

  - While a load is in flight, `get()` returns that same promise.
  - A success is kept until `now() >= loadedAt + ttlMs(value)`. With no `ttlMs`, it is kept for the life of the instance.
  - A failed result, or a rejected promise, is not kept, so the next `get()` loads again.
  - `reset()` forgets the kept value and the in-flight promise.
    - A load started before a `reset()` still answers its own waiters.
    - Its result is never stored afterwards, and never replaces the value or the in-flight promise of a later load. Use a generation counter that is checked before storing.

- Durations, unchanged from today:
  - Google token: 50 min.
  - eBay: `max(60, expires_in − 300)` s, where `T = { token: string; ttlMs: number }`.
  - TikTok: `(expires_in ?? 3600) − 120` s.
  - Currency and languages: no `ttlMs`, one `SharedResult` per language in a `Map`.

- [ ] **Step 1: Write the failing tests**

```ts
// shared-result.test.ts
it("shares one load between concurrent callers", ...)            // 5 parallel get() → load called 1 time
it("reloads after a failure", ...)                               // fail then ok → 2 loads, 2nd ok
it("reloads after a rejected load", ...)                         // reject then ok
it("keeps a success until its ttl, then reloads", ...)           // injected now: +ttl−1 → 1 load, +ttl → 2 loads
it("reset forgets the value", ...)
it("a load started before reset never restores its value", ...)
// get() → load A pending; reset(); get() → load B pending; resolve B ok("new") then A ok("old")
// → the A waiter gets "old", the B waiter gets "new", a later get() returns "new" with no 3rd load
it("a load started before reset never overwrites a newer in-flight load", ...)
// same, but resolve A ok("old") first while B is pending → a get() made now joins B (no 3rd load) and returns "new"

// adapters-http.test.ts
it("GoogleAdsKeywordPlannerProvider shares the token, currency and language between 6 countries", ...)
// 6 parallel getKeywordMetrics (same language) → oauth2 token URL fetched 1 time, currency query 1 time,
// language query 1 time, generateKeywordHistoricalMetrics 6 times
it("GoogleAdsKeywordPlannerProvider retries the token after a shared failure", ...)
// token endpoint 500 on the 1st call: 3 parallel calls all fail with 1 token fetch;
// a 4th call fetches the token again and succeeds
it("EbayBrowseProvider shares the application token", ...)
// 6 parallel getListings → identity token URL fetched 1 time
it("TikTokCommercialContentProvider shares the client token", ...)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/providers/shared-result.test.ts src/providers/adapters-http.test.ts`
Expected: FAIL (module missing; token fetched 6 times).

- [ ] **Step 3: Implement `sharedResult` and use it in the three adapters; `diagnose()` calls `.reset()`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass, including `src/providers/google-ads/diagnose.test.ts` unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/providers/shared-result.ts src/providers/shared-result.test.ts src/providers/google-ads/adapter.ts src/providers/ebay/adapter.ts src/providers/tiktok-commercial/adapter.ts src/providers/adapters-http.test.ts
git commit -m "fix(providers): share in-flight token and lookup requests between countries"
```

---

### Task 5: Protect `POST /api/analyses`

Problem 5, plus the forgeable rate-limit key.

**Files:**
- Create: `src/server/request-guard.ts`, `src/server/request-guard.test.ts`, `src/app/api/analyses/route.test.ts`
- Modify: `src/app/api/analyses/route.ts` (`POST`), `README.md` (API section)

**Interfaces:**
- Produces:

```ts
export type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly status: 403 | 415; readonly code: "forbidden_origin" | "unsupported_media_type"; readonly message: string };
export function checkJsonPost(headers: Headers): GuardResult
```

- Rules. These follow the Next.js Server Actions check, except that `X-Forwarded-Host` is **never** trusted: no trusted proxy is configured, and any client can send that header.
  - The media type (before `;`, trimmed, lower case) must be `application/json`. Otherwise 415, `"Content-Type application/json requis."`.
  - No `Origin`: accepted.
  - Otherwise 403, `"Origine non autorisée."`, in any of these cases:
    - `Origin` is `null`;
    - `Origin` is not exactly `<scheme>//<host>` (parsed with `new URL`, scheme `http:` or `https:`, no path, query, fragment or user info, a single value);
    - its host (lower case) differs from the `Host` header (lower case);
    - `Host` is missing.
- `POST` order: `checkJsonPost`, then the rate limit, then the body.
- Rate-limit key: the constant `"analysis:api"`. `X-Forwarded-For` is no longer read. A comment says per-client limits need a trusted proxy (deployment project).
- README `## API` gains a "Limits of the local protection" paragraph. It must say that:
  - this is not authentication: requests without `Origin` (curl, local scripts, any program on the machine) are accepted;
  - DNS rebinding (a foreign domain resolving to 127.0.0.1) passes an Origin = Host check;
  - GET routes are not protected;
  - the rate limit is one bucket for the whole API;
  - authentication and per-client limits belong to the deployment project.

- [ ] **Step 1: Write the failing tests**

```ts
// request-guard.test.ts — it.each table
// ok:  application/json, no Origin
// ok:  "application/json; charset=utf-8", Origin http://localhost:3100, Host localhost:3100
// 415: text/plain; 415: no Content-Type; 415: multipart/form-data
// 403: Origin http://localhost:3000 with Host localhost:3100; 403: Origin "null"; 403: Origin "not a url"
// 403 (forged proxy header ignored): Origin https://evil.example, Host localhost:3100, X-Forwarded-Host evil.example
// 403 (malformed origins, Host localhost:3100): "http://", "localhost:3100", "javascript:alert(1)", "file:///etc",
//      "http://localhost:3100/path", "http://user@localhost:3100", "http://localhost:3100, http://evil.example",
//      "http://[::1"
// 403: Origin http://localhost:3100 with no Host header
// ok:  Origin "HTTP://LOCALHOST:3100" with Host "localhost:3100" (case-insensitive)

// route.test.ts — vi.mock("@/server/services") with createAnalysis = vi.fn(async () => ({ id: "a", status: "completed" }))
it("refuses a text/plain body without starting an analysis", ...)       // 415, createAnalysis not called
it("refuses a cross-origin request without starting an analysis", ...)  // 403, not called
it("starts an analysis for a same-origin JSON request", ...)            // 201, called once
it("does not let X-Forwarded-For bypass the rate limit", ...)
// 11 valid requests, each with a different X-Forwarded-For → the 11th answers 429.
// vi.useFakeTimers() and advance 61 s between tests so windows reset.
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/server/request-guard.test.ts src/app/api/analyses/route.test.ts`
Expected: FAIL (module missing; text/plain answers 201; the XFF test never reaches 429).

- [ ] **Step 3: Implement `checkJsonPost`, use it in `POST`, change the rate-limit key, and document 415/403 in README `## API`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/request-guard.ts src/server/request-guard.test.ts src/app/api/analyses/route.ts src/app/api/analyses/route.test.ts README.md
git commit -m "fix(api): accept analysis requests only as same-origin JSON and stop trusting X-Forwarded-For"
```

---

### Task 6: Trend and forecast on calendar months

Problem 6.

**Files:**
- Modify: `src/engine/demand/model.ts` (`MODEL_METHOD`, `DemandModel`, `fitDemandModel`, `forecastPoints`)
- Test: `src/engine/demand/demand.test.ts`

**Interfaces:**
- Produces:
  - `DemandModel` gains `readonly lastT: number`.
  - `model.series` is the input sorted by month (a copy).
  - Design rows use `t = monthsBetween(series[0].month, p.month)` (from `@/domain/time`).
  - `forecastPoints` uses `lastT + h`.
  - `MODEL_METHOD` becomes `{ seasonal: "log_linear_ols_monthly_dummies_v2", trendOnly: "log_linear_ols_trend_only_v2" }`.
- Unchanged: `minMonthsForTrend` and `minMonthsForSeasonality` still count points.

- [ ] **Step 1: Write the failing tests**

```ts
it("measures growth on calendar months when months are missing", ...)
// syntheticSeries({ months: 36, base: 1000, annualGrowth: 0.2, amplitude: 0, peakMonth: 1 }) minus indices 10..13
// → annualGrowthPct(fitDemandModel(series)!) toBeCloseTo(20, 0)
it("forecasts from the month after the last observed one", ...)
// same gapped series: forecastPoints(model, 12)[0].month === addMonths(last.month, 1)
// and p50 ≈ last value × 1.2^(1/12) (relative error < 1 %)
it("gives the same model for unsorted input", ...)
// fit(shuffled).fit.beta toEqual fit(sorted).fit.beta
it("tags new forecasts with the v2 method", ...)
// analyzeDemand(...).forecast.method === "log_linear_ols_monthly_dummies_v2"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/engine/demand/demand.test.ts`
Expected: FAIL. The gapped series gives about 23 % instead of 20 %; the method is still `_v1`.

- [ ] **Step 3: Implement in `model.ts`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass. The existing demand, analyze-country and pipeline tests use contiguous series and are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/engine/demand/model.ts src/engine/demand/demand.test.ts
git commit -m "fix(engine): measure demand trend on calendar months, not array positions"
```

---

### Task 7: Keep the original error when recording a failure fails

Problem 7.

**Files:**
- Modify: `src/server/pipeline/run-analysis.ts` (catch block, lines 123-127), `src/server/repositories/drizzle-analysis-repository.ts` (`fail`, line 180)
- Test: `src/server/pipeline/run-analysis.test.ts`, `src/server/repositories/drizzle-repositories.test.ts`

**Interfaces:**
- Consumes: `toStorageSafeText` and `describeStorageError` (Task 3), and `createTestDatabase` (Task 1).
- Produces:
  - A private `recordFailure(repo: AnalysisRepository, id: string, error: unknown): Promise<void>` in `run-analysis.ts`. It calls `repo.fail(id, message)`. If that throws, it logs `console.error("[runAnalysis] could not record the failure of analysis <id>: <describeStorageError(recordingError)>")` and returns. The raw database message is never logged.
  - The catch block awaits it, then rethrows the original error.
  - `DrizzleAnalysisRepository.fail` stores `toStorageSafeText(error).slice(0, 2_000)`.

- [ ] **Step 1: Write the failing tests**

```ts
// run-analysis.test.ts
it("rethrows the pipeline error when recording the failure also fails", ...)
// mock set with macro: [{ meta: worldBankMeta, status: () => ({ state: "ready", detail: "" }),
//   getIndicators: async () => { throw new Error("collector crashed") } }]
// repositories.analyses.fail replaced by async () => { throw Object.assign(new Error("db down SECRET-TOKEN-123"), { code: "08006" }) }
// → rejects with "collector crashed"; console.error called once, its text contains the analysis id and "08006",
//   and contains neither "db down" nor "SECRET-TOKEN-123"
it("still records the failure when it can", ...)
// same crash, real memory fail → rejects with "collector crashed", findById status "failed"

// drizzle-repositories.test.ts
it("records a failure message that contains NUL", ...)
// fail(id, "boom\u0000") resolves; stored error === "boom"
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/server/pipeline/run-analysis.test.ts src/server/repositories/drizzle-repositories.test.ts`
Expected: FAIL. The first test rejects with "db down"; the NUL test rejects with an encoding error.

- [ ] **Step 3: Implement `recordFailure` and sanitise the message in `fail`**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/pipeline/run-analysis.ts src/server/repositories/drizzle-analysis-repository.ts src/server/pipeline/run-analysis.test.ts src/server/repositories/drizzle-repositories.test.ts
git commit -m "fix(pipeline): keep the original error when recording a failed analysis fails"
```

---

### Task 8: Reject forbidden characters in user input

Problem 8.

**Files:**
- Modify: `src/domain/schemas.ts` (`productName`, `extraTermSchema.term`)
- Create: `src/domain/schemas.test.ts`
- Test: `src/server/pipeline/run-analysis.test.ts`

**Interfaces:**
- Produces: a private `userText(min: number, max: number, minMessage: string | undefined, forbiddenMessage: string)` in `schemas.ts`. It returns `z.string().overwrite((v) => v.replace(/[\t\n\r]+/g, " ").trim()).min(min, minMessage).max(max).refine((v) => !/[\u0000-\u001F\u007F-\u009F]/.test(v) && v.isWellFormed(), forbiddenMessage)`.
- Field settings:
  - `productName`: 2 to 80, `"Nom de produit trop court"`, `"Le nom du produit contient des caractères non autorisés."`.
  - `term`: 2 to 80, default min message, `"Ce terme contient des caractères non autorisés."`.
- Unchanged: the inferred input and output types (`string`); spaces between words.

- [ ] **Step 1: Write the failing tests**

```ts
// schemas.test.ts — analysisInputSchema.safeParse({ productName, countries: ["FR"] })
it("rejects NUL in the product name with a French message", ...)
// "Lampe\u0000LED" → error at path ["productName"], message "Le nom du produit contient des caractères non autorisés."
it("rejects a lone surrogate", ...)                      // "Lampe \ud800" → same error
it("rejects a control character in an extra term", ...) // extraTerms [{ language: "de", term: "Lampe\u0007" }] → path extraTerms.0.term
it("turns tabs and line breaks into single spaces", ...) // "\tLampe\r\nLED " → "Lampe LED"
it("keeps accents, emoji and double spaces as typed", ...) // "Lampe  LED ❄️ été" unchanged

// run-analysis.test.ts
it("reports forbidden characters as a validation error, before any write", ...)
// runAnalysis({ ...input, productName: "a\u0000b" }) rejects AnalysisValidationError with issues[0].path "productName";
// listRecent(5) is empty
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- src/domain/schemas.test.ts src/server/pipeline/run-analysis.test.ts`
Expected: FAIL. NUL is accepted, and the line break is kept.

- [ ] **Step 3: Implement `userText` and use it for both fields**

- [ ] **Step 4: Run the tests and the type check**

Run: `npm run typecheck && npm test`
Expected: no type error (`isWellFormed` is in the `esnext` lib), all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/schemas.ts src/domain/schemas.test.ts src/server/pipeline/run-analysis.test.ts
git commit -m "fix(domain): reject control characters in product names and terms"
```

---

### Task 9: Final verification

No product change. Collects the evidence for the report.

- [ ] **Step 1: Full checks**

Run: `npm run check`
Expected: typecheck OK, lint 0 problems, every test passes. The baseline was 127; report the new total.

- [ ] **Step 2: Coverage**

Run: `npm run test:coverage`
Expected: all pass. Report the totals, and the `server/repositories` row now present (the baseline was 86.44 % lines with repositories excluded, so the two totals are not directly comparable: say so).

- [ ] **Step 3: Build without touching the real database**

Run (Git Bash): `PGLITE_DATA_DIR="<scratchpad>/pglite-build-probe" npm run build`
Expected: build OK, `/api/analyses` still listed as `ƒ` (dynamic), and the probe directory does not exist afterwards.

- [ ] **Step 4: Live run on a copy of the database**

- Copy `.data/pglite` to `<scratchpad>/pglite-verify`. Never open the original.
- Add an entry `ez-shop-verify` to `.claude/launch.json`:
  - runtimeExecutable `pwsh`;
  - runtimeArgs `["-NoProfile", "-Command", "$env:PGLITE_DATA_DIR='<scratchpad>/pglite-verify'; node node_modules/next/dist/bin/next dev --port 3100"]`;
  - port `3100`.

  Port 3000 belongs to another app.
- **No real API calls, no quota spent.** Every analysis in this step uses `"dataMode": "mock"`: synthetic providers, with the v2 sources and the translator replaced by unavailable stubs, so no network is used. The simple-mode form always sends `dataMode=live`, so do not submit it.
  - The rejected requests (415, 403, 400) stop before any provider runs.
  - Say this in the report.
- Start it with `preview_start`, then check, with `curl` from Git Bash:
  - a JSON POST with body `{"productName":"Lampe de bureau LED","countries":["FR"],"dataMode":"mock"}` → 201;
  - the same body as `text/plain` → 415;
  - `Origin: http://localhost:3000` → 403;
  - `Origin: https://evil.example` with `X-Forwarded-Host: evil.example` → 403;
  - `productName` "a\u0000b" (JSON escape) → 400 `invalid_input`.
- In the browser pane:
  - open the report of the mock analysis created above, then take a screenshot;
  - `read_console_messages` with no error;
  - `preview_logs` shows no `[cache]` or `[runAnalysis]` warning carrying raw text.
- If the preview or browser tools are unavailable, use what is available (curl, logs) and list what could not be checked.
- Report the measured duration of the mock analysis, without comparing it with the live baseline: mock data says nothing about live performance.
- `preview_stop`. Do not keep the `ez-shop-verify` entry unless the owner asks; revert `.claude/launch.json`.

- [ ] **Step 5: Final review of the branch**

Run: `git log --oneline 78d531e..HEAD` and `git diff --stat 78d531e..HEAD`
Expected: Tasks 0-8 as separate commits; no file under `drizzle/` or `src/server/db/schema.ts`; `20.9.0` and the screenshot still untracked. Nothing pushed (`git status -sb` shows no upstream).
