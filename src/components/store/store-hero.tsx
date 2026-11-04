"use client";

import type { CSSProperties } from "react";
import { PlanetAnchor } from "@/components/planet/planet-hooks";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { partCode, partOk, STORE_PARTS, type StoreData, type StorePart } from "./use-store-data";

/**
 * The top of "My store": the shop as its owner dressed it (logo, brand colour, slogan) and the
 * sources being read, each ticking as it arrives. The planet comes to rest in the round space on the
 * right once the main sources are read.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const OFF_CODES = new Set(["not_configured", "no_public_store", "no_account"]);
/** Parts that only add to the page: when they cannot be read, they are shown as off, not failed. */
const EXTRAS: readonly StorePart[] = ["brand", "web"];

type SourceState = "loading" | "done" | "failed" | "off";

function stateOf(data: StoreData, part: StorePart): SourceState {
  const state = data[part];
  if (state.status === "loading") return "loading";
  if (state.status === "failed") return "failed";
  if (partOk(state)) return "done";
  return OFF_CODES.has(partCode(state) ?? "") || EXTRAS.includes(part) ? "off" : "failed";
}

const DOT: Readonly<Record<SourceState, string>> = {
  loading: "store-source-dot store-source-dot-loading",
  done: "store-source-dot store-source-dot-done",
  failed: "store-source-dot store-source-dot-failed",
  off: "store-source-dot store-source-dot-off",
};

export function StoreHero({ data }: { readonly data: StoreData }) {
  const m = useMessages("storeBoard");
  const f = useFormat();
  const store = data.store.status === "done" && data.store.data.result.ok ? data.store.data.result.snapshot : null;
  const brand = data.brand.status === "done" && data.brand.data.ok ? data.brand.data.brand : null;
  const accent = brand?.primary && HEX.test(brand.primary) ? brand.primary : null;
  const logo = brand?.squareLogo ?? brand?.logo ?? null;
  const name = store?.shop.name ?? null;
  const states = STORE_PARTS.map((part) => ({ part, state: stateOf(data, part) }));
  const read = states.filter((s) => s.state !== "loading").length;

  const chips = store
    ? [
        t(m.hero.live, { time: f.date(store.readAt) }),
        store.shop.shipsTo.length ? t(m.hero.ships, { count: f.int(store.shop.shipsTo.length) }) : null,
        t(m.hero.currency, { currency: store.shop.currency }),
        store.shop.plan ? t(m.hero.plan, { plan: store.shop.plan }) : null,
      ].filter((chip): chip is string => chip !== null)
    : [];

  return (
    <section className="store-hero grid gap-6 min-[900px]:grid-cols-[1fr_300px] min-[900px]:items-center" style={accent ? ({ "--brand": accent } as CSSProperties) : undefined} aria-labelledby="store-hero-name">
      {/* The planet rests beside the card, on the page itself: a panel's surface would hide it. */}
      <div className="term relative min-w-0 overflow-hidden">
        <div aria-hidden className="store-hero-glow" />
        <div className="relative flex min-w-0 flex-col gap-6 p-6 sm:p-9">
          <div className="flex items-center gap-4">
            <div className="store-hero-mark" aria-hidden>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- the shop's own logo, from Shopify's CDN
                <img src={logo} alt="" referrerPolicy="no-referrer" className="size-full object-contain" />
              ) : (
                <span className="font-mono text-2xl font-semibold">{(name ?? "·").slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 id="store-hero-name" className="store-hero-name font-mono text-[clamp(1.6rem,3.6vw,2.6rem)] leading-[1.05] font-semibold tracking-[-0.05em] break-words">
                {name ?? m.arrival.title}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{brand?.slogan ?? (store ? store.shop.primaryUrl?.replace(/^https:\/\//, "") : m.arrival.intro)}</p>
            </div>
          </div>
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip} className="store-hero-chip rounded-pill border border-line px-3 py-1 text-xs text-muted-foreground">
                  {chip}
                </li>
              ))}
              {store?.shop.primaryUrl && (
                <li>
                  <a href={store.shop.primaryUrl} target="_blank" rel="noopener noreferrer" className="store-hero-chip inline-block rounded-pill border border-line px-3 py-1 text-xs font-medium hover:border-foreground">
                    {m.hero.site} ↗
                  </a>
                </li>
              )}
            </ul>
          )}
          <div>
            <p className="mb-2 font-mono text-[11px] tracking-[-0.02em] text-muted-foreground" aria-live="polite">
              {t(m.arrival.ready, { done: f.int(read), total: f.int(STORE_PARTS.length) })}
            </p>
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {states.map(({ part, state }, i) => (
                <li key={part} className="store-source flex items-center justify-between gap-3" style={{ "--i": i } as CSSProperties} data-state={state}>
                  <span className="flex items-center gap-2.5">
                    <span aria-hidden className={DOT[state]} />
                    {m.arrival.sources[part]}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{m.arrival.states[state]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <PlanetAnchor label={name ?? m.arrival.title} className="store-hero-planet mx-auto aspect-square w-[min(68vw,300px)] min-[900px]:w-[300px]" />
    </section>
  );
}
