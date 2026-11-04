import type { AdsReport, InstagramReport, StoreSnapshot, StoreSummary, StoreTraffic, StoreWeb, StripeReport } from "@/domain/store";
import type { Change, SalesPeriods } from "@/engine/store/periods";
import { costPerPurchase, roas } from "@/engine/store/summary";
import { trafficInsight } from "@/engine/store/traffic";

/**
 * The fact sheet the local AI reads before giving its advice: what the store, its visits and its ads
 * reported, written as plain lines. Every number the AI may write is on this sheet; derived figures
 * (rates, averages) are computed here, rounded once, so the AI never has to compute one itself.
 */

export interface ReviewMaterial {
  readonly snapshot: StoreSnapshot | null;
  readonly summary: StoreSummary | null;
  readonly traffic: StoreTraffic | null;
  readonly meta: AdsReport | null;
  readonly google: AdsReport | null;
  /** The last 30 days against the 30 before. */
  readonly periods?: SalesPeriods | null;
  readonly instagram?: InstagramReport | null;
  readonly stripe?: StripeReport | null;
  /** The store as the web sees it. */
  readonly web?: StoreWeb | null;
}

const LIST = 6;
const round = (value: number, digits = 2): string => String(Math.round(value * 10 ** digits) / 10 ** digits);
const pct = (value: number | null): string => (value === null ? "n/a" : `${round(value * 100, 1)}%`);
const money = (value: number | null, currency: string | null): string => (value === null ? "n/a" : `${round(value)} ${currency ?? ""}`.trim());

function salesLines(snapshot: StoreSnapshot, summary: StoreSummary): string[] {
  const c = summary.currency;
  const names = new Map(summary.products.map((p) => [p.id, p.title]));
  const lines = [
    `Store: ${snapshot.shop.name}. Currency ${c}. Ships to ${snapshot.shop.shipsTo.length} countries. Active products: ${snapshot.products.filter((p) => p.status === "ACTIVE").length}.`,
    `Sales since ${snapshot.ordersSince}: orders ${summary.orders}; net revenue ${money(summary.revenue, c)}; average order ${money(summary.averageOrder, c)}; units ${summary.units}; refunds ${money(summary.refunds, c)}; cancelled orders ${summary.cancelled}.${summary.testOnly ? " Only test orders exist: the store has no real sale yet." : ""}`,
  ];
  if (summary.byCountry.length) {
    lines.push(`Sales by country: ${summary.byCountry.slice(0, LIST).map((row) => `${row.country ?? "unknown"} ${row.orders} orders, ${money(row.revenue, c)} (${pct(row.share)} of revenue)`).join("; ")}.`);
  }
  const selling = summary.products.filter((p) => p.units > 0).slice(0, LIST);
  if (selling.length) lines.push(`Best-selling products: ${selling.map((p) => `${p.title}: ${p.units} units, ${money(p.revenue, c)}`).join("; ")}.`);
  if (summary.unsold.length) lines.push(`Active products with no sale: ${summary.unsold.length} (${summary.unsold.slice(0, LIST).map((id) => names.get(id) ?? id).join(", ")}).`);
  if (summary.lowStock.length) lines.push(`Selling products with little stock left: ${summary.lowStock.map((id) => names.get(id) ?? id).join(", ")}.`);
  if (summary.shipsWithoutSales.length) lines.push(`Countries shipped to with no sale: ${summary.shipsWithoutSales.length}.`);
  return lines;
}

function trafficLines(traffic: StoreTraffic): string[] {
  const t = traffic.totals;
  const i = trafficInsight(traffic);
  const lines = [
    `Site visits from ${traffic.since} to ${traffic.until}, robots left out: visits ${t.sessions}; unique visitors ${t.visitors}; repeat visits ${i.repeatVisits}; pageviews ${t.pageviews}; visits with an add to cart ${t.carts} (${pct(i.cartRate)} of visits); visits that reached checkout ${t.checkouts}; visits with a purchase ${t.purchases} (conversion ${pct(i.conversionRate)}); add to cart then purchase ${pct(i.cartToPurchase)}; bounce rate ${pct(i.bounceRate)}; average visit ${t.averageSeconds === null ? "n/a" : `${round(t.averageSeconds, 0)} seconds`}. Robot visits left out: ${traffic.botSessions}.`,
  ];
  if (traffic.bySource.length) {
    lines.push(`Visits by source: ${traffic.bySource.slice(0, LIST).map((s) => `${s.type}${s.name ? ` ${s.name}` : ""} ${s.sessions} visits, ${s.carts} with add to cart, ${s.purchases} with purchase`).join("; ")}.`);
  }
  lines.push(`Paid visits recognised: Google ${i.fromAds.google.sessions}, Meta ${i.fromAds.meta.sessions}, TikTok ${i.fromAds.tiktok.sessions}; all paid ${i.paid.sessions}.`);
  if (traffic.byCountry.length) lines.push(`Visits by country: ${traffic.byCountry.slice(0, LIST).map((s) => `${s.key} ${s.sessions} visits, ${s.purchases} with purchase`).join("; ")}.`);
  if (traffic.byDevice.length) lines.push(`Visits by device: ${traffic.byDevice.map((s) => `${s.key} ${s.sessions} visits, ${s.carts} with add to cart`).join("; ")}.`);
  if (traffic.byLanding.length) lines.push(`First page of the visit: ${traffic.byLanding.slice(0, LIST).map((s) => `${s.key} ${s.sessions} visits`).join("; ")}.`);
  return lines;
}

function adsLines(report: AdsReport): string {
  const t = report.total;
  const c = report.currency;
  const name = report.platform === "meta" ? "Meta Ads" : "Google Ads";
  const optional = (label: string, value: number | null | undefined) => (value === null || value === undefined ? "" : `; ${label} ${round(value, 1)}`);
  const top = report.campaigns.slice(0, 3).map((row) => `${row.label} ${money(row.spend, c)}`).join(", ");
  return `${name}, last 30 days, as the platform attributes them: spend ${money(t.spend, c)}; impressions ${t.impressions}${optional("people reached", t.reach)}; clicks ${t.clicks}${optional("link clicks", t.linkClicks)}${optional("landing page views", t.landingViews)}${optional("adds to cart", t.addToCart)}${optional("checkouts started", t.checkouts)}; purchases ${t.purchases === null ? "n/a" : round(t.purchases, 1)}; purchase value ${money(t.purchaseValue, c)}; return on ad spend ${roas(t) === null ? "n/a" : round(roas(t) ?? 0)}; cost per purchase ${money(costPerPurchase(t), c)}.${top ? ` Biggest campaigns: ${top}.` : ""}`;
}

const changeText = (c: Change): string =>
  c.previous === null ? "no period before to compare" : c.ratio === null ? `was ${round(c.previous)}` : `was ${round(c.previous)} (${c.ratio >= 0 ? "+" : ""}${round(c.ratio * 100, 1)}%)`;

function periodLines(p: SalesPeriods, traffic: StoreTraffic | null, currency: string): string[] {
  const lines = [
    `Last 30 days against the 30 before: net revenue ${money(p.current.totalRevenue, currency)}, ${changeText(p.revenue)}; orders ${p.current.totalOrders}, ${changeText(p.orders)}; average order ${money(p.current.averageOrder, currency)}, ${changeText(p.averageOrder)}.`,
  ];
  const before = traffic?.previous?.totals;
  if (traffic && before) {
    const now = traffic.totals;
    lines.push(`Visits the 30 days before: ${before.sessions} (now ${now.sessions}); visitors ${before.visitors} (now ${now.visitors}); visits with a purchase ${before.purchases} (now ${now.purchases}).`);
  }
  return lines;
}

function instagramLine(r: InstagramReport): string {
  const n = (v: number | null) => (v === null ? "n/a" : String(v));
  const posts = r.recent.slice(0, LIST).map((p) => `${p.type} ${p.postedAt.slice(0, 10)}: ${n(p.likes)} likes, ${n(p.comments)} comments`).join("; ");
  return `Instagram @${r.username}, ${r.since} to ${r.until}: followers ${n(r.followers)}; posts ${n(r.posts)}; accounts reached ${n(r.totals.reach)}; views ${n(r.totals.views)}; accounts engaged ${n(r.totals.accountsEngaged)}; interactions ${n(r.totals.interactions)}; link taps ${n(r.totals.linkTaps)}.${posts ? ` Latest posts: ${posts}.` : ""}`;
}

function stripeLine(r: StripeReport): string {
  const c = r.currency;
  return `Stripe payments, last 30 days: collected ${money(r.current.gross, c)} (30 days before ${money(r.previous.gross, c)}); successful payments ${r.current.payments} (before ${r.previous.payments}); refunded ${money(r.current.refunded, c)}; failed ${r.current.failed}; disputed ${r.current.disputed}.${r.methods.length ? ` Methods: ${r.methods.map((m) => `${m.key} ${m.payments}`).join(", ")}.` : ""}`;
}

function webLine(w: StoreWeb): string {
  const s = w.signals;
  const indicators = (w.visibility?.indicators ?? []).filter((v) => v.value !== null).map((v) => `${v.metric} ${round(v.value ?? 0)}`);
  return `The store on the web (${w.domain}): visibility level ${w.visibility?.level ?? "not readable"}; Tranco rank ${s?.trancoRank ?? (s?.outsideTranco ? "outside the top million" : "n/a")}; domain registered ${s?.registeredAt?.slice(0, 10) ?? "n/a"}; pages in its sitemaps ${w.siteMap?.urls ?? "n/a"}, product pages ${w.siteMap?.productUrls ?? "n/a"}; technologies seen ${w.technologies.map((t) => t.name).join(", ") || "none"}.${indicators.length ? ` Published indicators: ${indicators.join("; ")}.` : ""}`;
}

/** The sheet, with a line naming what could not be read so the advice does not pretend to see it. */
export function reviewFacts(material: ReviewMaterial): string {
  const lines: string[] = [];
  const missing: string[] = [];
  if (material.snapshot && material.summary) lines.push(...salesLines(material.snapshot, material.summary));
  else missing.push("sales");
  if (material.traffic) lines.push(...trafficLines(material.traffic));
  else missing.push("site visits");
  if (material.meta) lines.push(adsLines(material.meta));
  else missing.push("Meta Ads");
  if (material.google) lines.push(adsLines(material.google));
  else missing.push("Google Ads");
  if (material.periods && material.summary) lines.push(...periodLines(material.periods, material.traffic, material.summary.currency));
  if (material.instagram) lines.push(instagramLine(material.instagram));
  else missing.push("Instagram");
  if (material.stripe) lines.push(stripeLine(material.stripe));
  else missing.push("Stripe");
  if (material.web) lines.push(webLine(material.web));
  if (missing.length) lines.push(`Not available: ${missing.join(", ")}.`);
  return lines.join("\n");
}
