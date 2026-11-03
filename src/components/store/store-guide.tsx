"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { TermBar } from "@/components/marketing/term";
import { useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { cn } from "@/lib/utils";
import "./store-guide.css";

/**
 * Step-by-step guides to connect the store and the ad account. Each step says where to go, what to click
 * and what to copy; the steps EZ-Shop can check itself (keys saved, store read) tick on their own, the
 * others are ticked by hand and remembered in this browser only.
 */

/** Read-only permissions the store page uses, in the order the guide lists them. */
export const SHOPIFY_SCOPES = ["read_products", "read_inventory", "read_orders", "read_reports", "read_analytics", "read_markets", "read_shipping"] as const;

interface StepLink {
  readonly href: string;
  readonly site: string;
}

interface StepSpec {
  readonly id: string;
  readonly links?: readonly StepLink[];
  readonly copy?: string;
  readonly optional?: boolean;
  /** Done when EZ-Shop sees it done; otherwise ticked by hand. */
  readonly auto?: boolean;
}

const SHOPIFY_STEPS: readonly StepSpec[] = [
  { id: "dashboard", links: [{ href: "https://dev.shopify.com/dashboard/", site: "Dev Dashboard" }] },
  { id: "create" },
  { id: "scopes", copy: SHOPIFY_SCOPES.join(",") },
  { id: "release" },
  { id: "customerData", optional: true },
  { id: "install" },
  { id: "keys" },
  { id: "paste" },
  { id: "check" },
];

const META_STEPS: readonly StepSpec[] = [
  { id: "account", links: [{ href: "https://adsmanager.facebook.com/", site: "Ads Manager" }] },
  { id: "accountId" },
  { id: "developer", links: [{ href: "https://developers.facebook.com/", site: "Meta for Developers" }] },
  { id: "app", links: [{ href: "https://developers.facebook.com/apps/creation/", site: "Meta for Developers" }] },
  { id: "token", links: [{ href: "https://developers.facebook.com/tools/explorer/", site: "Graph API Explorer" }], copy: "ads_read" },
  {
    id: "extend",
    links: [
      { href: "https://developers.facebook.com/tools/debug/accesstoken/", site: "Access Token Debugger" },
      { href: "https://business.facebook.com/settings/system-users", site: "Business settings" },
    ],
  },
  { id: "paste" },
  { id: "read" },
];

const STORAGE_PREFIX = "ez-shop.guide.";
const CHANGED = "ez-shop:guide";

function readDone(platform: string): string {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + platform) ?? "";
  } catch {
    return "";
  }
}

function writeDone(platform: string, ids: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + platform, ids.join(","));
  } catch {
    // Private window or blocked storage: the ticks last until the page is left.
  }
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function useDoneSteps(platform: string): readonly string[] {
  const raw = useSyncExternalStore(subscribe, () => readDone(platform), () => "");
  return raw ? raw.split(",") : [];
}

export interface GuideState {
  /** Steps EZ-Shop saw done. */
  readonly checked: readonly string[];
  readonly connected: boolean;
}

export function ShopifyGuide({ state, grantedScopes, children }: { readonly state: GuideState; readonly grantedScopes: readonly string[] | null; readonly children?: React.ReactNode }) {
  const m = useMessages("storeGuide");
  return (
    <Guide platform="shopify" title={m.shopify.title} intro={m.shopify.intro} minutes={10} steps={SHOPIFY_STEPS} texts={m.shopify.steps} state={state} extra={{ check: <ScopeList granted={grantedScopes} /> }}>
      {children}
    </Guide>
  );
}

export function MetaGuide({ state, children }: { readonly state: GuideState; readonly children?: React.ReactNode }) {
  const m = useMessages("storeGuide");
  return (
    <Guide platform="meta" title={m.meta.title} intro={m.meta.intro} minutes={15} steps={META_STEPS} texts={m.meta.steps} state={state}>
      {children}
    </Guide>
  );
}

interface GuideProps {
  readonly platform: string;
  readonly title: string;
  readonly intro: string;
  readonly minutes: number;
  readonly steps: readonly StepSpec[];
  readonly texts: Readonly<Record<string, { readonly title: string; readonly body: string }>>;
  readonly state: GuideState;
  readonly extra?: Readonly<Record<string, React.ReactNode>>;
  /** The form the steps lead to, shown under them. */
  readonly children?: React.ReactNode;
}

function Guide({ platform, title, intro, minutes, steps, texts, state, extra, children }: GuideProps) {
  const m = useMessages("storeGuide");
  const ticked = useDoneSteps(platform);
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? !state.connected;
  const isDone = (id: string) => state.checked.includes(id) || ticked.includes(id);
  const done = steps.filter((step) => isDone(step.id)).length;

  function toggle(id: string) {
    writeDone(platform, ticked.includes(id) ? ticked.filter((x) => x !== id) : [...ticked, id]);
  }

  return (
    <section className="term overflow-hidden">
      <TermBar title={`tuto — ${platform}`} />
      <div className="flex flex-col gap-6 p-5 sm:p-7">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{title}</h2>
            {state.connected && (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-[var(--verdict-oui)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--verdict-oui)]">
                <Check aria-hidden className="size-3" />
                {m.connected}
              </span>
            )}
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{intro}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>{t(m.minutes, { count: String(minutes) })}</span>
            <span className="flex items-center gap-2">
              <span className="guide-progress" aria-hidden>
                <span style={{ width: `${(done / steps.length) * 100}%` }} />
              </span>
              {t(m.progress, { done: String(done), total: String(steps.length) })}
            </span>
            <button type="button" onClick={() => setOpen(!shown)} aria-expanded={shown} className="font-medium text-foreground underline decoration-line underline-offset-4 hover:decoration-foreground">
              {shown ? m.hide : m.show}
            </button>
          </div>
        </header>

        {shown && (
          <ol className="flex flex-col">
            {steps.map((step, i) => {
              const text = texts[step.id];
              if (!text) return null;
              const complete = isDone(step.id);
              const auto = state.checked.includes(step.id);
              return (
                <li key={step.id} className="guide-step relative flex gap-4 pb-7 last:pb-0">
                  <span aria-hidden className={cn("guide-dot", complete && "guide-dot-done")}>
                    {complete ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                    <h3 className={cn("flex flex-wrap items-center gap-2 font-medium leading-snug", complete && "text-muted-foreground")}>
                      <span className="sr-only">{`${i + 1}.`}</span>
                      {text.title}
                      {step.optional && <span className="rounded-pill border border-line px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{m.optional}</span>}
                    </h3>
                    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{text.body}</p>
                    {extra?.[step.id]}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {step.links?.map((link) => (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="guide-chip">
                          <ExternalLink aria-hidden className="size-3.5" />
                          {t(m.open, { site: link.site })}
                        </a>
                      ))}
                      {step.copy && <CopyChip value={step.copy} />}
                      {auto ? (
                        <span className="inline-flex items-center gap-1.5 px-1 text-xs text-[var(--verdict-oui)]">
                          <Check aria-hidden className="size-3.5" />
                          {m.checked}
                        </span>
                      ) : (
                        <button type="button" onClick={() => toggle(step.id)} aria-pressed={complete} className="guide-chip guide-chip-quiet">
                          {complete ? m.markUndone : m.markDone}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {children}
      </div>
    </section>
  );
}

function CopyChip({ value }: { readonly value: string }) {
  const m = useMessages("storeGuide");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="flex max-w-full flex-wrap items-center gap-2">
      <code className="max-w-full break-all rounded-tile border border-line bg-[var(--surface-2)] px-2.5 py-1.5 font-mono text-[12px] text-foreground">{value}</code>
      <button type="button" onClick={() => void copy()} className="guide-chip" aria-live="polite">
        {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
        {copied ? m.copied : m.copy}
      </button>
    </span>
  );
}

function ScopeList({ granted }: { readonly granted: readonly string[] | null }) {
  const m = useMessages("storeGuide").scopes;
  if (granted === null) return <p className="text-xs text-muted-foreground">{m.none}</p>;
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="text-xs font-medium">{m.title}</p>
      <ul className="flex flex-wrap gap-2">
        {SHOPIFY_SCOPES.map((scope) => {
          const ok = granted.includes(scope) || granted.includes(scope.replace(/^read_/, "write_"));
          return (
            <li key={scope} className={cn("inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-[11px]", ok ? "border-line text-foreground" : "border-[var(--verdict-non)] text-[var(--verdict-non)]")}>
              {ok ? <Check aria-hidden className="size-3" /> : <span aria-hidden>×</span>}
              {scope}
              <span className="sr-only">{ok ? m.granted : m.missing}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
