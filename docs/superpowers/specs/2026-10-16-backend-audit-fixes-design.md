# Backend audit fixes — design

Date: 2026-10-16. Baseline commit: `78d531e` (local snapshot, no remote).

## Why

A read-only audit of the EZ-Shop backend (pipeline, repositories, HTTP layer, adapters, engine) found no critical
defect, but eight reliability and safety problems. The owner approved fixing them in one batch, without changing
deployment or adding infrastructure. This is not a decision to keep the app local forever: authentication and
deployment readiness are a separate project.

Baseline (2026-10-16): typecheck OK, lint 0 warnings, 127/127 tests, 86.4 % line coverage (repositories excluded),
build OK. A France or 18-country analysis takes about 5 s.

## Approved scope

1. **Cache only validated payloads.** `cached()` (`src/providers/http.ts`) stores any HTTP 200 body before the adapter
   parses it. Error envelopes returned with status 200 are therefore cached: MyMemory quota warnings (90 days),
   AliExpress `error_response` (24 h), World Bank `[{ message }]` (7 days). Each adapter must say what a valid payload
   is; invalid payloads are never stored, and an invalid payload already in the cache is ignored on read.
2. **Cache failures never fail an analysis; external text is made storable.** Postgres rejects U+0000 in `text` and
   `jsonb`, and lone UTF-16 surrogates in `jsonb` (both verified on PGlite 0.5.9). Today a cache write error escapes
   `cached()` and fails the whole analysis. JSON payloads are sanitised when decoded; cache read and write errors are
   logged and skipped.
3. **Share in-flight token and lookup requests.** Google Ads (OAuth token, account currency, language constants),
   eBay and TikTok (application tokens) cache a value only after the request returns, so the 6 countries collected
   in parallel each start their own request. Concurrent callers share one request; a failure is not kept, so the
   next call retries.
4. **Integration tests for the database layer** with the real `drizzle/` migrations on an in-memory PGlite. The
   Drizzle repositories have no test today and are excluded from coverage.
5. **Protect `POST /api/analyses`.** It accepts any content type and any origin, so a page on another site can start
   analyses through a `text/plain` request that needs no preflight. Its rate-limit key comes from `X-Forwarded-For`,
   which a client can forge. The endpoint will require `application/json`, reject a foreign `Origin` (the rule
   Next.js applies to Server Actions), and use one rate-limit bucket.
6. **Trend on calendar months.** The demand model uses the array index as time, so a series with a missing month
   gets a wrong slope and shifted forecasts. Time becomes the number of months since the first point.
7. **Keep the original error.** If recording a failed analysis throws, that second error replaces the first one.
   The original error must be the one rethrown, and the recording error logged.
8. **Reject forbidden characters in user input.** Product names and extra terms accept control characters, which
   end in a database error (500) instead of a validation error (400).

## Decisions

- No new dependency, no schema change, no migration. Existing rows are never rewritten.
- Payload validity is decided by each adapter from the schema it already parses with: "valid" means the expected
  shape and no error envelope, not "contains useful data" (an empty but well-formed answer stays cacheable).
- Sanitising replaces lone surrogates with U+FFFD and removes U+0000, in string values and object keys.
- Tabs, carriage returns and line feeds in user text become a single space (pasted multi-line names stay usable);
  other C0/C1 control characters and lone surrogates are rejected with a French message. *Builder's call, flagged
  for the owner.*
- API contract change: `POST /api/analyses` answers 415 without `Content-Type: application/json` and 403 for a
  foreign or `null` `Origin`. Requests without `Origin` (curl, scripts) are accepted. One rate-limit bucket for the
  API (10 per minute). Per-client limits need a trusted proxy: deployment project.
- Demand model method ids move from `_v1` to `_v2`. Stored analyses keep `_v1`. Contiguous series give the same
  numbers as before.

## Non-goals

Extending the `observations` audit table to the v2 sources; the eBay Canada sales-tax question; optional cleanups
(dead `parseTitleLookup`, empty `20.9.0` file); authentication; background jobs; dependency upgrades.

## Data safety and rollback

- Work on a branch from `78d531e`; one commit per task, never pushed. Revert one task with `git revert <sha>`, or
  drop the whole batch by switching back to `main`.
- Tests never open `.data/pglite`: they use an in-memory PGlite. The live check runs on a copy of the database.
- The cache needs no clean-up: invalid entries are skipped on read and overwritten by the next valid answer.
