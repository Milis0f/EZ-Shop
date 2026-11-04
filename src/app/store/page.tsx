import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TermPrompt } from "@/components/marketing/term";
import { StoreDashboard } from "@/components/store/store-dashboard";
import { TABS, type Tab } from "@/components/store/store-tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { getEnv } from "@/config/env";
import { getLocale, getMessages } from "@/i18n/server";
import { localizedEditorAccess } from "../connectors/editor-access";
import { isLocalRequest } from "@/server/connector-config";
import { adsConfigured, keptAds } from "@/server/store/ads";
import { normaliseStoreDomain, shopifyConfig } from "@/server/store/shopify";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("store");
  return { title: m.metadataTitle, robots: { index: false, follow: false } };
}

/**
 * The owner's own store: the page only says what is set up; every source is then read by the browser
 * from this machine's own server (/api/store/*), each on its own, and never stored.
 */
export default async function StorePage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const m = await getMessages("store");
  return (
    <div className="mx-auto max-w-6xl pt-[3vh]">
      <header className="animate-enter mb-8 max-w-2xl">
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
  const local = await isLocalRequest();

  return (
    <StoreDashboard
      connections={{
        shopify: { configured: config !== null, domain: env.SHOPIFY_STORE_DOMAIN ? normaliseStoreDomain(env.SHOPIFY_STORE_DOMAIN) : null, idSet: Boolean(env.SHOPIFY_CLIENT_ID), secretSet: Boolean(env.SHOPIFY_CLIENT_SECRET) },
        meta: { configured: ads.meta, account: env.META_AD_ACCOUNT_ID ?? null, tokenSet: Boolean(env.META_ADS_ACCESS_TOKEN) },
        google: ads.google,
        stripe: { keySet: Boolean(env.STRIPE_API_KEY) },
        editable: access.enabled,
        editableReason: access.enabled ? null : access.reason,
      }}
      keptAds={{ meta: local ? keptAds("meta") : null, google: local ? keptAds("google") : null }}
      initialTab={tab}
    />
  );
}
