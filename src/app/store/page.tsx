import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TermPrompt } from "@/components/marketing/term";
import { PlanetScene } from "@/components/planet/planet-hooks";
import { StoreDashboard } from "@/components/store/store-dashboard";
import { TABS, type Tab } from "@/components/store/store-tabs";
import type { StoreConnections } from "@/components/store/store-connect";
import { Skeleton } from "@/components/ui/skeleton";
import { getEnv } from "@/config/env";
import { COUNTRY_CODES, type CountryCode } from "@/domain/country";
import { summariseStore } from "@/engine/store/summary";
import { getLocale, getMessages } from "@/i18n/server";
import { localizedEditorAccess } from "../connectors/editor-access";
import { isLocalRequest } from "@/server/connector-config";
import { adsConfigured, keptAds } from "@/server/store/ads";
import { normaliseStoreDomain, readStore, shopifyConfig } from "@/server/store/shopify";
import { readTraffic } from "@/server/store/traffic";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("store");
  return { title: m.metadataTitle, robots: { index: false, follow: false } };
}

const isCovered = (code: string): code is CountryCode => (COUNTRY_CODES as readonly string[]).includes(code);

/** The owner's own store: read on each visit, on this machine only, never stored. */
export default async function StorePage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const m = await getMessages("store");
  return (
    <div className="mx-auto max-w-6xl pt-[3vh]">
      <header className="animate-enter mb-10 max-w-2xl">
        <TermPrompt command="ez-shop boutique" className="mb-5" />
        <h1 className="page-title">{m.title}</h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">{m.intro}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-panel" />}>
        <StoreContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function StoreContent({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const asked = (await searchParams).tab;
  const tab: Tab | undefined = TABS.find((value) => value === asked);
  const locale = await getLocale();
  const env = getEnv();
  const access = await localizedEditorAccess(locale);
  const config = shopifyConfig(env);
  const ads = adsConfigured(env);

  // The store is private: it is read only for requests made on this machine, in development or not.
  const local = await isLocalRequest();
  const [result, traffic] = local ? await Promise.all([readStore(env), readTraffic(env)]) : ([{ ok: false, code: "remote" }, { ok: false, code: "remote" }] as const);
  const connections: StoreConnections = {
    shopify: { configured: config !== null, domain: env.SHOPIFY_STORE_DOMAIN ? normaliseStoreDomain(env.SHOPIFY_STORE_DOMAIN) : null, idSet: Boolean(env.SHOPIFY_CLIENT_ID), secretSet: Boolean(env.SHOPIFY_CLIENT_SECRET) },
    meta: { configured: ads.meta, account: env.META_AD_ACCOUNT_ID ?? null, tokenSet: Boolean(env.META_ADS_ACCESS_TOKEN) },
    google: ads.google,
    grantedScopes: result.ok ? result.snapshot.grantedScopes : null,
    editable: access.enabled,
    editableReason: access.enabled ? null : access.reason,
  };
  const summary = result.ok ? summariseStore(result.snapshot) : null;
  const shipsTo = result.ok ? result.snapshot.shop.shipsTo.filter(isCovered) : [];
  const selling = summary ? summary.byCountry.map((row) => row.country).filter((code): code is CountryCode => code !== null && isCovered(code)) : [];
  const planetCountries = selling.length ? selling : shipsTo;

  return (
    <>
      {planetCountries[0] && <PlanetScene focus={planetCountries[0]} countries={planetCountries} />}
      <StoreDashboard
        result={result}
        summary={summary}
        connections={connections}
        traffic={traffic}
        keptAds={{ meta: local ? keptAds("meta") : null, google: local ? keptAds("google") : null }}
        analysisCountries={shipsTo}
        initialTab={tab}
      />
    </>
  );
}
