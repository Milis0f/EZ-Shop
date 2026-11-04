"use client";

import Link from "next/link";
import { KindMarker } from "@/components/data/kind-marker";
import { BarList, exactPrice, StatGrid, StatTile } from "@/components/web/web-visuals";
import type { InstagramResult, StoreWebResult, StripeResult } from "@/domain/store";
import { change } from "@/engine/store/periods";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { Donut, TrendChart } from "./store-charts";
import { regionName, shortDay } from "./store-format";
import { KpiCard } from "./store-kpis";
import { Panel } from "./store-traffic";
import type { PartState } from "./use-store-data";

/** The shop on the web, Instagram and Stripe: each a part of its own, shown once it has been read. */

export function Waiting() {
  return <div aria-hidden className="store-wait" />;
}

const LEVEL_TONE = { low: "var(--verdict-non)", medium: "var(--verdict-surveiller)", high: "var(--verdict-oui)" } as const;

export function StoreWebPanel({ state }: { readonly state: PartState<StoreWebResult> }) {
  const m = useMessages("storeBoard").web;
  const names = useMessages("connectors").providerNames;
  const f = useFormat();
  if (state.status === "loading") return <Waiting />;
  const web = state.status === "done" && state.data.ok ? state.data.web : null;
  return (
    <Panel bar="ma-boutique — web" title={m.title}>
      <p className="-mt-3 mb-5 max-w-prose text-sm leading-relaxed text-muted-foreground">{m.intro}</p>
      {!web ? (
        <p className="text-sm text-muted-foreground">{m.unavailable}</p>
      ) : (
        <div className="flex flex-col gap-5">
          <StatGrid>
            <StatTile
              label={m.level}
              value={
                web.visibility?.level ? (
                  <span className="inline-flex items-center gap-2" style={{ color: LEVEL_TONE[web.visibility.level] }}>
                    <KindMarker kind="assumption" />
                    {m.levels[web.visibility.level]}
                  </span>
                ) : (
                  "—"
                )
              }
              note={web.visibility?.level ? undefined : m.levelNone}
            />
            <StatTile label={m.tranco} value={web.signals?.trancoRank ? f.int(web.signals.trancoRank) : "—"} note={web.signals?.outsideTranco ? m.noTranco : undefined} />
            <StatTile label={m.registered} value={web.signals?.registeredAt ? f.day(web.signals.registeredAt) : "—"} />
            <StatTile label={m.archived} value={web.signals?.archivedMonths != null ? f.int(web.signals.archivedMonths) : "—"} />
            <StatTile label={m.sitemap} value={web.siteMap ? f.int(web.siteMap.urls) : "—"} />
            <StatTile label={m.products} value={web.siteMap ? f.int(web.siteMap.productUrls) : "—"} />
          </StatGrid>
          <div>
            <p className="text-xs text-muted-foreground">{m.tech}</p>
            {web.technologies.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {web.technologies.map((tech) => (
                  <li key={tech.name} className="rounded-pill border border-line px-3 py-1 text-xs">
                    {tech.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{m.none}</p>
            )}
          </div>
          {web.domain.endsWith(".myshopify.com") && <p className="text-xs leading-relaxed text-muted-foreground">{m.myshopify}</p>}
          {web.visibility && web.visibility.notConfigured.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(m.more, { list: web.visibility.notConfigured.map((id) => (id in names ? names[id as keyof typeof names] : id)).join(", ") })}{" "}
              <Link href="/connectors" className="underline decoration-line underline-offset-4 hover:text-foreground">
                /connectors
              </Link>
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

export function InstagramView({ state, compact = false }: { readonly state: PartState<InstagramResult>; readonly compact?: boolean }) {
  const m = useMessages("storeBoard").social;
  const charts = useMessages("storeBoard").charts;
  const f = useFormat();
  if (state.status === "loading") return <Waiting />;
  const result = state.status === "done" ? state.data : null;
  if (!result || !result.ok) {
    const code = result && !result.ok ? result.code : "api_error";
    return (
      <Panel bar="réseaux — instagram" title={code === "not_configured" ? m.connectTitle : m.title}>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{code === "not_configured" ? m.connectBody : m.failures[code]}</p>
      </Panel>
    );
  }
  const r = result.report;
  const num = (v: number | null) => (v === null ? "—" : f.int(v));
  const hasInsights = r.reachByDay.length > 0 || r.totals.reach !== null || r.totals.views !== null;
  return (
    <div className="flex flex-col gap-4">
      <Panel bar={`réseaux — @${r.username}`} title={m.title}>
        <div className="-mt-2 mb-5 flex items-center gap-3">
          {r.picture && (
            // eslint-disable-next-line @next/next/no-img-element -- the owner's own profile picture, from Instagram's CDN
            <img src={r.picture} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full border border-line object-cover" />
          )}
          <div>
            <p className="font-medium">@{r.username}</p>
            <p className="text-xs text-muted-foreground">{m.intro}</p>
          </div>
        </div>
        <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 min-[900px]:grid-cols-4"}>
          <KpiCard index={0} label={m.followers} value={num(r.followers)} />
          <KpiCard index={1} label={m.reach} value={num(r.totals.reach)} spark={r.reachByDay.map((d) => d.value)} slot={4} />
          <KpiCard index={2} label={m.views} value={num(r.totals.views)} />
          <KpiCard index={3} label={m.interactions} value={num(r.totals.interactions)} />
        </div>
        {!hasInsights && <p className="mt-4 text-xs text-muted-foreground">{m.noInsights}</p>}
        {!compact && r.reachByDay.length > 1 && (
          <div className="mt-6">
            <TrendChart
              title={m.reachTitle}
              days={r.reachByDay.map((d) => d.day)}
              series={[{ key: "reach", label: m.reach, values: r.reachByDay.map((d) => d.value), slot: 3 }]}
              formatValue={(v) => f.int(v)}
              formatDay={(day) => shortDay(day, f.locale)}
              tableLabel={charts.table}
              dayLabel={charts.day}
              whole
            />
          </div>
        )}
      </Panel>
      {!compact && r.recent.length > 0 && (
        <Panel bar="réseaux — publications" title={m.recentTitle}>
          <ul className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-3 min-[1000px]:grid-cols-4">
            {r.recent.map((post, i) => (
              <li key={post.id} className="store-kpi overflow-hidden rounded-panel border border-line bg-[var(--surface)]" style={{ "--i": i } as React.CSSProperties}>
                <a href={post.permalink ?? undefined} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="aspect-square bg-[var(--surface-2)]">
                    {post.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element -- the owner's own post, from Instagram's CDN
                      <img src={post.thumbnail} alt={post.caption ?? ""} referrerPolicy="no-referrer" loading="lazy" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-3 text-xs">
                    <span className="text-muted-foreground">{f.day(post.postedAt)}</span>
                    <span>
                      {post.likes !== null && t(m.likes, { count: f.int(post.likes) })}
                      {post.comments !== null && ` · ${t(m.comments, { count: f.int(post.comments) })}`}
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export function StripeView({ state, compact = false }: { readonly state: PartState<StripeResult>; readonly compact?: boolean }) {
  const m = useMessages("storeBoard").payments;
  const charts = useMessages("storeBoard").charts;
  const f = useFormat();
  if (state.status === "loading") return <Waiting />;
  const result = state.status === "done" ? state.data : null;
  if (!result || !result.ok) {
    const code = result && !result.ok ? result.code : "api_error";
    return (
      <Panel bar="paiements — stripe" title={code === "not_configured" ? m.connectTitle : m.title}>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{code === "not_configured" ? m.connectBody : m.failures[code]}</p>
      </Panel>
    );
  }
  const r = result.report;
  const money = (v: number) => exactPrice(f, v, r.currency);
  const methodSlices = r.methods.slice(0, 5).map((row) => ({ key: row.key, label: row.key.replaceAll("_", " "), value: row.payments, display: f.int(row.payments) }));
  return (
    <div className="flex flex-col gap-4">
      <Panel bar="paiements — stripe" title={m.title}>
        <p className="-mt-3 mb-5 text-sm text-muted-foreground">{m.intro}</p>
        <div className={compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 min-[900px]:grid-cols-4"}>
          <KpiCard index={0} label={m.gross} value={money(r.current.gross)} change={change(r.current.gross, r.previous.gross)} previous={money(r.previous.gross)} spark={r.byDay.map((d) => d.gross)} slot={2} />
          <KpiCard index={1} label={m.payments} value={f.int(r.current.payments)} change={change(r.current.payments, r.previous.payments)} previous={f.int(r.previous.payments)} />
          <KpiCard index={2} label={m.refunded} value={money(r.current.refunded)} change={change(r.current.refunded, r.previous.refunded)} previous={money(r.previous.refunded)} lowerIsBetter />
          <KpiCard index={3} label={m.failed} value={f.int(r.current.failed)} change={change(r.current.failed, r.previous.failed)} previous={f.int(r.previous.failed)} lowerIsBetter />
        </div>
        <StatGrid className="mt-5">
          <StatTile label={m.available} value={r.available === null ? "—" : money(r.available)} />
          <StatTile label={m.pending} value={r.pending === null ? "—" : money(r.pending)} />
          <StatTile label={m.disputed} value={f.int(r.current.disputed)} />
        </StatGrid>
        {r.otherCurrencies > 0 && <p className="mt-4 text-xs text-muted-foreground">{t(m.otherCurrencies, { count: f.int(r.otherCurrencies) })}</p>}
        {r.capped && <p className="mt-1 text-xs text-muted-foreground">{m.capped}</p>}
      </Panel>
      {!compact && r.current.payments > 0 && (
        <>
          <Panel bar="paiements — jours">
            <TrendChart
              title={m.dayTitle}
              days={r.byDay.map((d) => d.day)}
              series={[{ key: "gross", label: m.gross, values: r.byDay.map((d) => d.gross), slot: 2 }]}
              formatValue={money}
              formatDay={(day) => shortDay(day, f.locale)}
              tableLabel={charts.table}
              dayLabel={charts.day}
            />
          </Panel>
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            <Panel bar="paiements — moyens">
              <Donut title={m.methodsTitle} slices={methodSlices} total={f.int(r.current.payments)} totalLabel={m.payments} />
            </Panel>
            <Panel bar="paiements — pays" title={m.countriesTitle}>
              <BarList bars={r.countries.map((row) => ({ key: row.key, label: regionName(row.key, f.locale, row.key), value: row.payments, display: f.int(row.payments) }))} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
