"use server";

import { revalidatePath } from "next/cache";
import { getEnv } from "@/config/env";
import type { AdsResult, ReviewResult } from "@/domain/store";
import { summariseStore } from "@/engine/store/summary";
import { getLocale, getMessages } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { updateEnvLocal, type EnvUpdate } from "@/server/env-file";
import { checkRateLimit } from "@/server/rate-limit";
import { adsConfigured, readAds } from "@/server/store/ads";
import { reviewStore } from "@/server/store/review";
import { readStore } from "@/server/store/shopify";
import { readTraffic } from "@/server/store/traffic";
import { isStoreDomain, normaliseStoreDomain } from "@/server/store/shopify";
import { isLocalRequest } from "@/server/connector-config";
import { localizedEditorAccess } from "../connectors/editor-access";
import type { StoreConnectionState } from "./form-state";

const SAVE_RATE_LIMIT = { limit: 20, windowMs: 60_000 } as const;
/** Each read spends the ad platform's API quota. */
const ADS_RATE_LIMIT = { limit: 6, windowMs: 60_000 } as const;
/** One review fills the local AI for up to a minute. */
const REVIEW_RATE_LIMIT = { limit: 3, windowMs: 60_000 } as const;

/** Printable ASCII without spaces or quotes: what client IDs, secrets and tokens are made of. */
const SAFE_VALUE = /^[\x21\x23-\x26\x28-\x7e]{1,512}$/;

type Group = "shopify" | "meta";

interface FieldRule {
  readonly key: string;
  readonly check: (raw: string) => { ok: true; value: string } | { ok: false; error: "domain" | "value" | "account" };
}

const plain = (raw: string) => (SAFE_VALUE.test(raw.trim()) ? { ok: true as const, value: raw.trim() } : { ok: false as const, error: "value" as const });

const FIELDS: Readonly<Record<Group, readonly FieldRule[]>> = {
  shopify: [
    {
      key: "SHOPIFY_STORE_DOMAIN",
      check: (raw) => {
        const domain = normaliseStoreDomain(raw);
        return isStoreDomain(domain) ? { ok: true, value: domain } : { ok: false, error: "domain" };
      },
    },
    { key: "SHOPIFY_CLIENT_ID", check: plain },
    { key: "SHOPIFY_CLIENT_SECRET", check: plain },
  ],
  meta: [
    { key: "META_ADS_ACCESS_TOKEN", check: plain },
    {
      key: "META_AD_ACCOUNT_ID",
      check: (raw) => {
        const digits = raw.trim().replace(/^act_/i, "");
        return /^\d{3,25}$/.test(digits) ? { ok: true, value: `act_${digits}` } : { ok: false, error: "account" };
      },
    },
  ],
};

const SECTIONS: Readonly<Record<Group, string>> = { shopify: "Shopify — Ma boutique", meta: "Meta Ads — Ma boutique" };

/**
 * Saves the store's or the ad account's keys to .env.local and applies them to the running server.
 * An empty field keeps the saved value; values are validated, never logged and never sent back.
 */
export async function saveStoreConnection(_prev: StoreConnectionState, formData: FormData): Promise<StoreConnectionState> {
  const locale = await getLocale();
  const m = (await getMessages("store", locale)).connect;
  const access = await localizedEditorAccess(locale);
  if (!access.enabled) return { status: "error", message: access.reason };

  const limit = checkRateLimit("store:save", SAVE_RATE_LIMIT.limit, SAVE_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { status: "error", message: t(m.errors.tooMany, { seconds: limit.retryAfterSeconds }) };

  const group = formData.get("group");
  if (group !== "shopify" && group !== "meta") return { status: "error", message: m.errors.nothing };

  const updates: EnvUpdate[] = [];
  const fieldErrors: Record<string, string> = {};
  for (const field of FIELDS[group]) {
    const raw = formData.get(field.key);
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const checked = field.check(raw);
    if (checked.ok) updates.push({ key: field.key, value: checked.value });
    else fieldErrors[field.key] = m.errors[checked.error];
  }
  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: Object.values(fieldErrors)[0] ?? m.errors.value, fieldErrors };
  if (updates.length === 0) return { status: "error", message: m.errors.nothing };

  try {
    await updateEnvLocal(updates, SECTIONS[group]);
  } catch (error: unknown) {
    // The message describes the file system error only; values are never part of it.
    console.error("[saveStoreConnection] .env.local could not be written:", error instanceof Error ? error.message : "unknown error");
    return { status: "error", message: m.errors.write };
  }
  for (const { key, value } of updates) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  revalidatePath("/store");
  return { status: "saved", message: m.saved, savedAt: Date.now() };
}

/** Reads one of the owner's ad accounts, on request; `fresh` asks the platform even within ten minutes. */
export async function loadStoreAds(platform: "meta" | "google", fresh = false): Promise<AdsResult> {
  // The ads of the account are private: read only from this machine.
  if (!(await isLocalRequest())) return { ok: false, code: "remote" };
  const limit = checkRateLimit(`store:ads:${platform}`, ADS_RATE_LIMIT.limit, ADS_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { ok: false, code: "rate_limited" };
  return readAds(platform, getEnv(), { fresh: fresh === true });
}

/**
 * The local AI's advice on the store: the store, its visits and the connected ad accounts are read
 * again on the server (nothing from the browser is trusted), then the AI writes from those facts only.
 */
export async function reviewMyStore(): Promise<ReviewResult> {
  if (!(await isLocalRequest())) return { ok: false, code: "remote" };
  const limit = checkRateLimit("store:review", REVIEW_RATE_LIMIT.limit, REVIEW_RATE_LIMIT.windowMs);
  if (!limit.allowed) return { ok: false, code: "rate_limited" };
  const env = getEnv();
  const ads = adsConfigured(env);
  const [store, traffic, meta, google] = await Promise.all([
    readStore(env),
    readTraffic(env),
    ads.meta ? readAds("meta", env) : null,
    ads.google ? readAds("google", env) : null,
  ]);
  const snapshot = store.ok ? store.snapshot : null;
  return reviewStore(
    {
      snapshot,
      summary: snapshot ? summariseStore(snapshot) : null,
      traffic: traffic.ok ? traffic.traffic : null,
      meta: meta?.ok ? meta.report : null,
      google: google?.ok ? google.report : null,
    },
    await getLocale(),
  );
}
