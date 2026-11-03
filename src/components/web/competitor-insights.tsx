"use client";

import { KindMarker } from "@/components/data/kind-marker";
import { Funnel, TrendChart } from "@/components/store/store-charts";
import { monthName, regionName } from "@/components/store/store-format";
import { Button } from "@/components/ui/button";
import type { SalesEstimate } from "@/domain/competitor";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { CatalogueBlock } from "./competitor-catalogue";
import { Fact, Insufficient, ReportPanel, estimateNumber, type Ready } from "./competitor-bits";
import { ExternalLink } from "./web-results";
import { BarList, exactPrice, SimpleTable, StatGrid, StatTile } from "./web-visuals";

/** The shop's own card, its catalogue in figures and its best sellers. */
export function ShopTab({ result, onCheck }: { readonly result: Ready; readonly onCheck: (url: string) => void }) {
  const m = useMessages("competitorReport").shop;
  const check = useMessages("web").competitor.check;
  const tableView = useMessages("storeLive").traffic.tableView;
  const f = useFormat();
  const { profile, catalogue, bestSellers, presence } = result;
  const currency = result.observed.currency ?? profile?.currency ?? null;
  const money = (value: number) => exactPrice(f, value, currency);

  return (
    <div className="flex flex-col gap-4">
      {profile && (
        <ReportPanel bar="boutique — fiche" title={profile.name ?? result.domain} kind="observed" intro={m.profileIntro}>
          <dl className="divide-y divide-line">
            {(profile.city || profile.country) && <Fact label={m.location} value={[profile.city, profile.country ? regionName(profile.country, f.locale, profile.country) : null].filter(Boolean).join(", ")} />}
            {profile.currency && <Fact label={m.currency} value={profile.currency} />}
            {profile.installments !== null && <Fact label={m.installments} value={profile.installments ? m.yes : m.no} />}
            {profile.description && <Fact label={m.description} value={<span className="font-normal">{profile.description}</span>} />}
          </dl>
          {profile.shipsTo.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">{m.shipsTo}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {profile.shipsTo.map((code) => (
                  <li key={code} className="rounded-pill border border-line px-2.5 py-0.5 text-xs">
                    {regionName(code, f.locale, code)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ReportPanel>
      )}

      {result.storefront && <StorefrontPanel storefront={result.storefront} />}

      <ReportPanel bar="boutique — meilleures ventes" title={m.bestTitle} kind="observed" intro={result.bestSellersFrom === "collection" ? t(m.bestCollection, { name: result.bestCollection ?? "" }) : m.bestIntro}>
        {bestSellers.length ? (
          <SimpleTable
            columns={[m.rank, m.product, m.price, m.stock, ""]}
            rows={bestSellers.map((best) => ({
              key: best.url,
              cells: [
                <span key="rank" className={best.checked ? "font-semibold text-[var(--verdict-oui)]" : undefined}>
                  {f.int(best.rank)}
                </span>,
                <span key="title" className="flex flex-col">
                  <ExternalLink href={best.url}>{best.title}</ExternalLink>
                  {best.checked && <span className="text-xs text-[var(--verdict-oui)]">{m.thisProduct}</span>}
                </span>,
                best.price === null ? "—" : money(best.price),
                best.available === null ? "—" : best.available ? m.inStock : m.soldOutShort,
                <Button key="check" type="button" variant="outline" size="sm" onClick={() => onCheck(best.url)}>
                  {check}
                </Button>,
              ],
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{result.sources.some((s) => s.id === "best_sellers" && s.state === "refused") ? m.bestRefused : m.bestNone}</p>
        )}
      </ReportPanel>

      {catalogue && (
        <>
          <p className="px-1 text-xs text-muted-foreground">
            {profile?.productCount ? t(m.read, { count: f.int(catalogue.counted), pages: f.int(catalogue.pagesRead), total: f.int(profile.productCount) }) : t(m.readAll, { count: f.int(catalogue.counted), pages: f.int(catalogue.pagesRead) })}
          </p>
          <CatalogueBlock catalogue={catalogue} currency={currency} onCheck={onCheck} />
          <ReportPanel bar="boutique — activité" title={m.activityTitle} kind="observed">
            <StatGrid className="mb-6">
              <StatTile label={m.soldOut} value={f.int(catalogue.soldOut)} />
              {catalogue.discountAverage !== null && <StatTile label={m.discountAverage} value={f.ratioPct(Math.round(catalogue.discountAverage * 1000) / 1000)} />}
              <StatTile label={m.updates} value={`${f.int(catalogue.updated24h)} / ${f.int(catalogue.updated7d)}`} />
            </StatGrid>
            {catalogue.autoUpdated && <p className="mb-5 rounded-tile border border-line px-4 py-3 text-sm text-muted-foreground">{m.autoUpdated}</p>}
            {catalogue.launchesByMonth.length > 1 && <p className="mb-3 text-xs text-muted-foreground">{m.launchesNote}</p>}
            {catalogue.launchesByMonth.length > 1 && (
              <TrendChart
                title={m.launchesTitle}
                days={catalogue.launchesByMonth.map((row) => row.month)}
                series={[{ key: "launches", label: m.launchesTitle, values: catalogue.launchesByMonth.map((row) => row.count), slot: 1 }]}
                formatValue={(v) => f.int(Math.round(v))}
                formatDay={(month) => monthName(month, f.locale)}
                tableLabel={tableView}
                dayLabel={m.month}
                whole
              />
            )}
          </ReportPanel>
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            {catalogue.types.length > 0 && (
              <ReportPanel bar="boutique — types" title={m.typesTitle} kind="observed">
                <BarList bars={catalogue.types.map((type) => ({ key: type.name, label: type.name, value: type.count, display: f.int(type.count) }))} />
              </ReportPanel>
            )}
            {(presence?.collections.length ?? 0) > 0 && (
              <ReportPanel bar="boutique — collections" title={m.collectionsTitle} kind="observed">
                <BarList bars={(presence?.collections ?? []).map((c) => ({ key: c.title, label: c.title, value: c.count ?? 0, display: c.count === null ? "—" : f.int(c.count) }))} />
              </ReportPanel>
            )}
          </div>
          {catalogue.tags.length > 0 && (
            <ReportPanel bar="boutique — tags" title={m.tagsTitle} kind="observed">
              <ul className="flex flex-wrap gap-2">
                {catalogue.tags.map((tag) => (
                  <li key={tag.name} className="rounded-pill border border-line px-3 py-1 font-mono text-xs tracking-[-0.02em]">
                    {tag.name} <span className="text-muted-foreground">· {f.int(tag.count)}</span>
                  </li>
                ))}
              </ul>
            </ReportPanel>
          )}
        </>
      )}
    </div>
  );
}

function EstimateCard({ title, estimate, empty, productPrice }: { readonly title: string; readonly estimate: SalesEstimate | null; readonly empty: string; readonly productPrice: boolean }) {
  const m = useMessages("competitorReport").sales;
  const f = useFormat();
  if (!estimate) {
    return (
      <div className="rounded-panel border border-line p-5">
        <h4 className="font-medium">{title}</h4>
        <p className="mt-3">
          <Insufficient />
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      </div>
    );
  }
  const money = (value: number) => exactPrice(f, Math.round(value), estimate.currency);
  const rows = [
    { key: "month", label: m.perMonth, values: [estimate.perMonth.p10, estimate.perMonth.p50, estimate.perMonth.p90].map((v) => estimateNumber(v, f)) },
    ...(estimate.revenuePerMonth ? [{ key: "revenue", label: m.revenue, values: [estimate.revenuePerMonth.p10, estimate.revenuePerMonth.p50, estimate.revenuePerMonth.p90].map(money) }] : []),
    { key: "total", label: m.total, values: [estimate.total.p10, estimate.total.p50, estimate.total.p90].map((v) => estimateNumber(v, f)) },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-panel border border-line p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-medium">
          <KindMarker kind="estimate" />
          {title}
        </h4>
        <span className="rounded-pill border px-2.5 py-0.5 font-mono text-[11px]" style={{ borderColor: estimate.confidence === "medium" ? "var(--verdict-surveiller)" : "var(--verdict-non)", color: estimate.confidence === "medium" ? "var(--verdict-surveiller)" : "var(--verdict-non)" }}>
          {m.confidence[estimate.confidence]}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t(m.method, { reviews: f.int(estimate.reviews), months: f.number(estimate.months, { maximumFractionDigits: 1 }) })}</p>
      <SimpleTable columns={[m.columns.what, m.columns.low, m.columns.middle, m.columns.high]} rows={rows.map((row) => ({ key: row.key, cells: [row.label, ...row.values] }))} />
      <div>
        <p className="text-xs font-medium">{m.assumptionsTitle}</p>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>{m.rates}</li>
          <li>{m.ageFrom[estimate.ageFrom]}</li>
          {estimate.price !== null && <li>{productPrice ? m.priceProduct : m.priceShop}</li>}
          {estimate.cautions.map((caution) => (
            <li key={caution} className="text-foreground">
              {m.cautions[caution]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Sales estimated from reviews, and the changes seen between two checks. */
export function SalesTab({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").sales;
  const f = useFormat();
  const watch = result.watch;
  const changes = watch?.changes ?? null;
  return (
    <div className="flex flex-col gap-4">
      <ReportPanel bar="ventes — estimation" title={m.title} kind="estimate" intro={m.intro}>
        <div className="grid gap-4 min-[1200px]:grid-cols-2">
          {result.pageKind === "product" && <EstimateCard title={m.productTitle} estimate={result.estimates.product} empty={m.noProduct} productPrice />}
          <EstimateCard title={m.shopTitle} estimate={result.estimates.shop} empty={m.noShop} productPrice={false} />
        </div>
      </ReportPanel>

      <ReportPanel bar="ventes — suivi" title={m.watchTitle} kind="observed" intro={m.watchIntro}>
        {!watch && <p className="text-sm text-muted-foreground">{m.watchNone}</p>}
        {watch && !changes && <p className="text-sm">{t(m.watchFirst, { date: f.date(watch.firstSeenAt) })}</p>}
        {watch && changes && (
          <div className="flex flex-col gap-6">
            <p className="text-sm">{t(m.watchSince, { date: f.date(changes.previousAt), readings: f.int(watch.readings), compared: f.int(changes.compared) })}</p>
            <StatGrid>
              <StatTile label={m.soldOut} value={f.int(changes.soldOut)} />
              <StatTile label={m.restocked} value={f.int(changes.restocked)} />
              <StatTile label={m.priceUp} value={f.int(changes.priceUp)} />
              <StatTile label={m.priceDown} value={f.int(changes.priceDown)} />
              <StatTile label={m.added} value={f.int(changes.added)} />
              <StatTile label={m.removed} value={f.int(changes.removed)} />
            </StatGrid>
            {changes.movers.length > 0 && (
              <Funnel title={m.moversTitle} steps={changes.movers.map((mover) => ({ key: mover.url, label: mover.title, value: mover.soldOut, display: f.int(mover.soldOut) }))} />
            )}
            <p className="text-xs text-muted-foreground">{m.watchNote}</p>
          </div>
        )}
      </ReportPanel>
    </div>
  );
}

/** The domain's age and popularity, the accounts and site of the shop, and its ads. */
export function VisibilityTab({ result }: { readonly result: Ready }) {
  const m = useMessages("competitorReport").visibility;
  const f = useFormat();
  const d = result.domainSignals;
  const presence = result.presence;
  const ads = result.adLibrary;
  const adsUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&q=${encodeURIComponent(result.profile?.name ?? result.domain)}`;
  const day = (iso: string | null) => (iso ? f.day(iso) : m.notRead);

  return (
    <div className="flex flex-col gap-4">
      <ReportPanel bar="visibilité — domaine" title={m.domainTitle} kind="observed" intro={m.domainIntro}>
        {d ? (
          <dl className="divide-y divide-line">
            <Fact label={m.registered} value={day(d.registeredAt)} />
            <Fact label={m.firstArchived} value={day(d.firstArchivedAt)} />
            {d.archivedMonths !== null && <Fact label={m.archivedMonths} value={f.int(d.archivedMonths)} />}
            <Fact
              label={m.tranco}
              value={
                d.trancoRank !== null ? (
                  <span className="flex flex-col sm:items-end">
                    {f.int(d.trancoRank)}
                    {d.trancoRankBefore !== null && <span className="text-xs font-normal text-muted-foreground">{t(m.trancoTrend, { before: f.int(d.trancoRankBefore) })}</span>}
                  </span>
                ) : d.outsideTranco ? (
                  m.noTranco
                ) : (
                  m.notRead
                )
              }
            />
          </dl>
        ) : (
          <Insufficient />
        )}
      </ReportPanel>

      <div className="grid gap-4 min-[900px]:grid-cols-2">
        <ReportPanel bar="visibilité — réseaux" title={m.socialTitle} kind="observed">
          {presence?.social.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {presence.social.map((account) => (
                <li key={account.network}>
                  <ExternalLink href={account.url}>{m.networks[account.network]}</ExternalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{m.socialNone}</p>
          )}
        </ReportPanel>
        <ReportPanel bar="visibilité — site" title={m.siteTitle} kind="observed">
          <dl className="divide-y divide-line">
            <Fact label={m.theme} value={presence?.theme ? [presence.theme.schema ?? presence.theme.name, presence.theme.version].filter(Boolean).join(" ") : "—"} />
            <Fact label={m.languages} value={presence?.languages.length ? presence.languages.join(", ").toUpperCase() : "—"} />
          </dl>
        </ReportPanel>
      </div>

      <ReportPanel bar="visibilité — pubs" title={m.adsTitle} kind="observed">
        {ads?.state === "done" && (
          <>
            <p className="text-sm">
              {t(m.adsDone, { count: f.int(ads.activeAds ?? 0), term: ads.term ?? "", country: ads.country ? regionName(ads.country, f.locale, ads.country) : "", advertisers: f.int(ads.advertisers ?? 0) })}
            </p>
            {ads.truncated && <p className="mt-1 text-xs text-muted-foreground">{m.adsTruncated}</p>}
          </>
        )}
        {ads?.state === "not_configured" && <p className="text-sm text-muted-foreground">{m.adsNotConfigured}</p>}
        {ads?.state === "outside_eu" && <p className="text-sm text-muted-foreground">{m.adsOutsideEu}</p>}
        {ads?.state === "failed" && <p className="text-sm text-muted-foreground">{m.adsFailed}</p>}
        <ul className="mt-4 flex flex-col gap-1.5 text-sm">
          <li>
            <ExternalLink href={adsUrl}>{m.adsLink}</ExternalLink>
          </li>
          <li>
            <ExternalLink href={`https://www.trustpilot.com/review/${encodeURIComponent(result.domain)}`}>{m.trustpilot}</ExternalLink>
          </li>
          <li>
            <ExternalLink href={`https://www.similarweb.com/website/${encodeURIComponent(result.domain)}/`}>{m.similarweb}</ExternalLink>
          </li>
        </ul>
      </ReportPanel>
    </div>
  );
}

/** The shop's official Storefront API: where and in what currency it sells, and the product's price by country. */
function StorefrontPanel({ storefront }: { readonly storefront: NonNullable<Ready["storefront"]> }) {
  const m = useMessages("competitorReport").shop;
  const f = useFormat();
  const amount = (value: number, currency: string) => exactPrice(f, value, currency);
  return (
    <ReportPanel bar={`boutique — storefront ${storefront.apiVersion}`} title={m.storefrontTitle} kind="observed" intro={m.storefrontIntro}>
      <dl className="divide-y divide-line">
        {storefront.currencies.length > 0 && <Fact label={m.currencies} value={storefront.currencies.join(", ")} />}
        {storefront.languages.length > 0 && <Fact label={m.languages} value={storefront.languages.join(", ")} />}
        {storefront.countries.length > 0 && <Fact label={m.countriesCount} value={f.int(storefront.countries.length)} />}
      </dl>
      {storefront.prices.length > 0 ? (
        <div className="mt-4">
          <SimpleTable
            columns={[m.country, m.priceRange, m.compareAt, m.availability]}
            rows={storefront.prices.map((p) => ({
              key: p.country,
              cells: [
                regionName(p.country, f.locale, p.country),
                p.min === p.max ? amount(p.min, p.currency) : `${amount(p.min, p.currency)} – ${amount(p.max, p.currency)}`,
                p.compareAtMax !== null ? amount(p.compareAtMax, p.currency) : "—",
                p.available ? m.inStock : m.soldOut,
              ],
            }))}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{m.noPrices}</p>
      )}
    </ReportPanel>
  );
}
