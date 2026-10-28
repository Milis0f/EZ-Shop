import type { ProviderId } from "@/domain/provenance";
import type { Locale } from "@/i18n/config";
import { messagesFor, type Messages } from "@/i18n/messages";

/**
 * What each connector brings and how to switch it on, step by step, in the user's words
 * (texts in src/i18n/messages/connectors.ts, one set per language).
 * Links point to the official pages (checked 2026-10-15). Menu names on third-party consoles can change:
 * steps describe the goal first, the click path second.
 */

export type ConnectorGroup = "ready" | "free_account" | "application" | "planned";

export interface GuideStep {
  readonly title: string;
  readonly body: string;
  readonly link?: { readonly label: string; readonly url: string };
  /** Variables typed at this step. */
  readonly fields?: readonly string[];
}

export interface ConnectorGuide {
  readonly group: ConnectorGroup;
  /** One sentence: what the analysis gains with this source. */
  readonly brings: string;
  readonly cost: string;
  /** Rough setup time, once accounts exist. */
  readonly setupTime?: string;
  readonly steps: readonly GuideStep[];
  /** Why an unofficial source may break, shown on its "unofficial" chip. */
  readonly unofficialNote?: string;
}

export const CONNECTOR_GROUP_ORDER: readonly ConnectorGroup[] = ["ready", "free_account", "application", "planned"];

export interface ConnectorGroupText {
  readonly id: ConnectorGroup;
  readonly title: string;
  readonly intro: string;
}

/** The groups of the sources page, in page order, with their title and intro in `locale`. */
export function connectorGroups(locale: Locale): readonly ConnectorGroupText[] {
  const groups = messagesFor("connectors", locale).groups;
  return CONNECTOR_GROUP_ORDER.map((id) => ({ id, ...groups[id] }));
}

type GuideTexts = Messages<"connectors">["guides"];

const CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";

function buildGuides(g: GuideTexts): Readonly<Record<ProviderId, ConnectorGuide>> {
  const ready = (brings: string): ConnectorGuide => ({ group: "ready", brings, cost: g.free, steps: [] });
  const planned = (texts: { readonly brings: string; readonly cost: string }, fields: readonly string[]): ConnectorGuide => ({
    group: "planned",
    brings: texts.brings,
    cost: texts.cost,
    steps: [{ ...g.prepareStep, fields }],
  });

  return {
    "world-bank": ready(g.worldBank.brings),
    eurostat: ready(g.eurostat.brings),
    oecd: ready(g.oecd.brings),
    "google-autocomplete": { ...ready(g.googleAutocomplete.brings), unofficialNote: g.googleAutocomplete.unofficial },
    wikimedia: {
      group: "ready",
      brings: g.wikimedia.brings,
      cost: g.free,
      steps: [
        {
          title: g.wikimedia.contact.title,
          body: g.wikimedia.contact.body,
          link: { label: g.wikimedia.contact.link, url: "https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits" },
          fields: ["WIKIMEDIA_CONTACT"],
        },
      ],
    },
    "uk-trade-tariff": ready(g.ukTradeTariff.brings),
    "usitc-hts": ready(g.usitcHts.brings),
    "vat-rates": ready(g.vatRates.brings),
    "ecb-fx": ready(g.ecbFx.brings),
    mymemory: ready(g.mymemory.brings),

    "youtube-data": {
      group: "free_account",
      brings: g.youtube.brings,
      cost: g.youtube.cost,
      setupTime: g.youtube.setupTime,
      steps: [
        {
          title: g.youtube.enable.title,
          body: g.youtube.enable.body,
          link: { label: g.youtube.enable.link, url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
        },
        { title: g.youtube.key.title, body: g.youtube.key.body, link: { label: g.youtube.key.link, url: CREDENTIALS_URL } },
        { ...g.youtube.paste, fields: ["YOUTUBE_API_KEY"] },
      ],
    },

    "ebay-browse": {
      group: "free_account",
      brings: g.ebay.brings,
      cost: g.free,
      setupTime: g.ebay.setupTime,
      steps: [
        { ...g.ebay.account, link: { label: "eBay Developers Program", url: "https://developer.ebay.com/" } },
        { ...g.ebay.keyset, link: { label: "Application Keys", url: "https://developer.ebay.com/my/keys" } },
        {
          ...g.ebay.activate,
          link: { label: "Marketplace Account Deletion", url: "https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion" },
        },
        { ...g.ebay.paste, fields: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] },
      ],
    },

    "aliexpress-affiliate": {
      group: "free_account",
      brings: g.aliexpress.brings,
      cost: g.free,
      setupTime: g.aliexpress.setupTime,
      steps: [
        { ...g.aliexpress.join, link: { label: "AliExpress Portals", url: "https://portals.aliexpress.com/" } },
        { ...g.aliexpress.app, link: { label: "AliExpress Open Platform", url: "https://openservice.aliexpress.com/" } },
        { ...g.aliexpress.paste, fields: ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"] },
      ],
    },

    "google-ads-keyword-planner": {
      group: "application",
      brings: g.googleAds.brings,
      cost: g.googleAds.cost,
      setupTime: g.googleAds.setupTime,
      steps: [
        {
          title: g.googleAds.enable.title,
          body: g.googleAds.enable.body,
          link: { label: g.googleAds.enable.link, url: "https://console.cloud.google.com/apis/library/googleads.googleapis.com" },
        },
        {
          title: g.googleAds.basic.title,
          body: g.googleAds.basic.body,
          link: { label: g.googleAds.basic.link, url: "https://console.cloud.google.com/google/ads-apis/overview" },
        },
        {
          title: g.googleAds.oauth.title,
          body: g.googleAds.oauth.body,
          link: { label: g.googleAds.oauth.link, url: CREDENTIALS_URL },
          fields: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"],
        },
        {
          ...g.googleAds.refresh,
          link: { label: "OAuth Playground", url: "https://developers.google.com/oauthplayground" },
          fields: ["GOOGLE_ADS_REFRESH_TOKEN"],
        },
        { ...g.googleAds.account, fields: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_API_VERSION"] },
      ],
    },

    "google-trends": {
      group: "application",
      brings: g.googleTrends.brings,
      cost: g.googleTrends.cost,
      steps: [
        {
          title: g.googleTrends.apply.title,
          body: g.googleTrends.apply.body,
          link: { label: g.googleTrends.apply.link, url: "https://developers.google.com/search/apis/trends" },
        },
        { ...g.googleTrends.paste, fields: ["GOOGLE_TRENDS_API_KEY"] },
      ],
    },

    "meta-ad-library": {
      group: "application",
      brings: g.metaAdLibrary.brings,
      cost: g.metaAdLibrary.cost,
      steps: [
        {
          title: g.metaAdLibrary.identity.title,
          body: g.metaAdLibrary.identity.body,
          link: { label: g.metaAdLibrary.identity.link, url: "https://www.facebook.com/ID" },
        },
        { ...g.metaAdLibrary.app, link: { label: "Meta for Developers", url: "https://developers.facebook.com/apps/" } },
        { ...g.metaAdLibrary.paste, fields: ["META_GRAPH_API_VERSION", "META_AD_LIBRARY_ACCESS_TOKEN"] },
      ],
    },

    "tiktok-commercial-content": {
      group: "application",
      brings: g.tiktokCommercial.brings,
      cost: g.tiktokCommercial.cost,
      steps: [
        { ...g.tiktokCommercial.apply, link: { label: "Commercial Content API", url: "https://developers.tiktok.com/products/commercial-content-api" } },
        { ...g.tiktokCommercial.paste, fields: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] },
      ],
    },

    "meta-marketing-api": planned(g.metaMarketing, ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"]),
    "tiktok-business-api": planned(g.tiktokBusiness, ["TIKTOK_BUSINESS_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"]),
  };
}

const GUIDES_BY_LOCALE: Readonly<Record<Locale, Readonly<Record<ProviderId, ConnectorGuide>>>> = {
  en: buildGuides(messagesFor("connectors", "en").guides),
  fr: buildGuides(messagesFor("connectors", "fr").guides),
  es: buildGuides(messagesFor("connectors", "es").guides),
};

/** Every connector's guide, in `locale`. */
export function connectorGuides(locale: Locale): Readonly<Record<ProviderId, ConnectorGuide>> {
  return GUIDES_BY_LOCALE[locale];
}
