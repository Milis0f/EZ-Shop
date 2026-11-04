"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { saveStoreConnection } from "@/app/store/actions";
import { INITIAL_STORE_CONNECTION_STATE } from "@/app/store/form-state";
import { TermBar } from "@/components/marketing/term";
import { PendingButton } from "@/components/motion/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StoreFailure } from "@/domain/store";
import { useMessages } from "@/i18n/client";
import { MetaGuide, ShopifyGuide } from "./store-guide";

export interface StoreConnections {
  readonly shopify: { readonly configured: boolean; readonly domain: string | null; readonly idSet: boolean; readonly secretSet: boolean };
  readonly meta: { readonly configured: boolean; readonly account: string | null; readonly tokenSet: boolean };
  readonly google: boolean;
  readonly stripe: { readonly keySet: boolean };
  /** Access scopes the store granted, once it was read; null when it could not be read. */
  readonly grantedScopes: readonly string[] | null;
  /** Keys can be written from this page (local machine, development). */
  readonly editable: boolean;
  readonly editableReason: string | null;
}

interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly secret: boolean;
  readonly set: boolean;
  readonly value?: string | null;
  readonly placeholder?: string;
}

export function StoreConnect({ connections, failure }: { readonly connections: StoreConnections; readonly failure: StoreFailure | null }) {
  const m = useMessages("store");
  const guide = useMessages("storeGuide");
  const g = guide.google;
  const c = m.connect;
  const board = useMessages("storeBoard").connect;
  const connected = connections.grantedScopes !== null;
  return (
    <div className="flex flex-col gap-4">
      {failure && (
        <p role="status" className="panel p-5 text-sm text-muted-foreground sm:p-6">
          {m.failures[failure]}
        </p>
      )}
      {!connections.editable && connections.editableReason && <p className="text-sm text-muted-foreground">{connections.editableReason}</p>}
      <ShopifyGuide
        state={{ connected, checked: [...(connections.shopify.configured ? ["paste"] : []), ...(connected ? ["check"] : [])] }}
        grantedScopes={connections.grantedScopes}
      >
        <ConnectionForm
          group="shopify"
          title={c.shopifyTitle}
          intro={c.shopifyIntro}
          disabled={!connections.editable}
          fields={[
            { name: "SHOPIFY_STORE_DOMAIN", label: c.fields.domain, secret: false, set: connections.shopify.domain !== null, value: connections.shopify.domain, placeholder: c.placeholders.domain },
            { name: "SHOPIFY_CLIENT_ID", label: c.fields.clientId, secret: true, set: connections.shopify.idSet },
            { name: "SHOPIFY_CLIENT_SECRET", label: c.fields.clientSecret, secret: true, set: connections.shopify.secretSet },
          ]}
        />
      </ShopifyGuide>
      <MetaGuide state={{ connected: connections.meta.configured, checked: connections.meta.configured ? ["paste"] : [] }}>
        <ConnectionForm
          group="meta"
          title={c.metaTitle}
          intro={c.metaIntro}
          disabled={!connections.editable}
          fields={[
            { name: "META_ADS_ACCESS_TOKEN", label: c.fields.metaToken, secret: true, set: connections.meta.tokenSet },
            { name: "META_AD_ACCOUNT_ID", label: c.fields.metaAccount, secret: false, set: connections.meta.account !== null, value: connections.meta.account, placeholder: c.placeholders.metaAccount },
          ]}
        />
      </MetaGuide>
      <section className="term overflow-hidden">
        <TermBar title="tuto — instagram" />
        <div className="p-5 sm:p-7">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{board.instagramTitle}</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{board.instagramBody}</p>
        </div>
      </section>
      <ConnectionForm
        group="stripe"
        title={board.stripeTitle}
        intro={board.stripeIntro}
        disabled={!connections.editable}
        fields={[{ name: "STRIPE_API_KEY", label: board.stripeKey, secret: true, set: connections.stripe.keySet, placeholder: "rk_live_…" }]}
      />
      <section className="term overflow-hidden">
        <TermBar title="tuto — google" />
        <div className="p-5 sm:p-7">
          <h2 className="font-mono text-[17px] font-semibold tracking-[-0.04em]">{g.title}</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{g.body}</p>
          {connections.google && <p className="mt-2 text-sm text-[var(--verdict-oui)]">{guide.connected}</p>}
          <Link href="/connectors" className="mt-4 inline-block text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-foreground">
            {g.link}
          </Link>
        </div>
      </section>
    </div>
  );
}

function ConnectionForm({ group, title, intro, fields, disabled }: { readonly group: "shopify" | "meta" | "stripe"; readonly title: string; readonly intro: string; readonly fields: readonly FieldSpec[]; readonly disabled: boolean }) {
  const c = useMessages("store").connect;
  const [state, action, pending] = useActionState(saveStoreConnection, INITIAL_STORE_CONNECTION_STATE);
  const id = useId();
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <div className="rounded-panel border border-line bg-[var(--surface-2)]/40">
      <form action={action} className="flex flex-col gap-5 p-5 sm:p-6">
        <input type="hidden" name="group" value={group} />
        <div>
          <h3 className="font-mono text-[15px] font-semibold tracking-[-0.04em]">{title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{intro}</p>
        </div>
        <div className="grid gap-4 min-[900px]:grid-cols-3">
          {fields.map((field) => (
            <div key={field.name} className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={`${id}-${field.name}`} className="flex items-baseline justify-between gap-2">
                <span>{field.label}</span>
                {field.set && <span className="font-mono text-[11px] font-normal text-muted-foreground">{c.set}</span>}
              </Label>
              <Input
                id={`${id}-${field.name}`}
                name={field.name}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                defaultValue={field.secret ? undefined : (field.value ?? undefined)}
                placeholder={field.secret && field.set ? "••••••••" : field.placeholder}
                aria-invalid={Boolean(errors[field.name]) || undefined}
                className="h-10 font-mono text-sm"
              />
              {errors[field.name] && <p className="text-xs text-[var(--verdict-non)]">{errors[field.name]}</p>}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{c.keep}</p>
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton pending={pending} disabled={disabled} pendingLabel={c.saving} className="h-10 px-6 text-sm">
            {c.save}
          </PendingButton>
          {state.status !== "idle" && (
            <p role={state.status === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">
              {state.message}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
