# i18n

Interface languages: English (default), French, Spanish. No library: typed dictionaries and Intl.

## Files

| File | Role |
|---|---|
| `config.ts` | `LOCALES`, `Locale`, `DEFAULT_LOCALE` (`"en"`), `LOCALE_COOKIE` (`"ez-locale"`), labels, Intl tags, `isLocale` |
| `messages/<area>.ts` | One dictionary per area, exporting `en`, `fr`, `es` |
| `messages/index.ts` | `MESSAGES` registry, `Area`, `Messages<A>`, `messagesFor(area, locale)` |
| `server.ts` | `getLocale()`, `getMessages(area)` for Server Components |
| `client.tsx` | `LocaleProvider`, `useLocale()`, `useMessages(area)`, `useFormat()` |
| `translate.ts` | `t(template, params)` and `plural(locale, count, forms)` |
| `format.ts` | `formatNumber`, `formatInt`, `formatDecimal`, `formatCompact`, `formatPct`, `formatRatioPct`, `formatMoney`, `formatDate` (value, locale) |
| `negotiate.ts` | Cookie, then Accept-Language, then English |
| `locale-script.ts` | Inline script setting `<html lang>` before paint, cookie writer |

Areas and owners: `common` and `shell` (foundation), `home`, `report`, `analysis-advanced`,
`country`, `connectors`, `methodology`, `ai`, `server-messages`. Edit only your own area file, so
parallel work never conflicts. Put a word in `common` only when two areas or more need it.

## Adding a string

1. Add it to `en` in your area file (the object is `as const`).
2. Add the same key to `fr` and `es`. They are typed `DeepStringShape<typeof en>`: a missing or
   extra key fails `npm run typecheck`, and `messages/parity.test.ts` checks keys, empty strings
   and `{placeholders}`.
3. Sentence case, no all-caps labels (the verdict words are the one exception). `DATA_INSUFFICIENT`
   is a literal marker: never translate it, translate only the human label next to it.

Variables use `{name}`: `t(m.ranking.title, { count: formatInt(n, locale) })`. Format numbers
before inserting them. For plurals, store `{ one, other }` (optionally `zero`) and call
`plural(locale, n, m.recent.count)`.

## Using it

Server Components (all pages render below the root layout's `<Suspense>`, so request data is allowed):

```tsx
import { getLocale, getMessages } from "@/i18n/server";
const locale = await getLocale();
const m = await getMessages("report", locale);
```

`generateMetadata` can call `getMessages` too. Client Components:

```tsx
"use client";
import { useLocale, useMessages, useFormat } from "@/i18n/client";
const m = useMessages("report");
const f = useFormat(); // f.pct(12.3), f.money(9.5, "EUR"), f.date(iso)
```

Server actions and route handlers call `getLocale()` like a Server Component.

## Formatting

Always pass the active locale: `formatPct(v, locale, { signed: true })`, `formatMoney(v, locale, "EUR")`.
`src/lib/format.ts` keeps its old signatures with an optional trailing locale that defaults to `"fr"`
(the pre-i18n output); pass the locale when you translate a screen, or switch to `@/i18n/format`.
English uses `en-GB` (day-month-year, 24-hour clock) for a European audience.

## Adding a language

1. Add the code to `LOCALES` and its entries to `LOCALE_LABELS`, `LOCALE_SHORT_LABELS`, `INTL_LOCALES`,
   and to `PERCENT_SUFFIX` in `format.ts`.
2. Export the new object from every `messages/<area>.ts`; typecheck and the parity test list what is missing.
3. The switcher, the cookie and Accept-Language negotiation pick it up from `LOCALES`.
