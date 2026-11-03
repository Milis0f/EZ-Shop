"use client";

import { KindMarker } from "@/components/data/kind-marker";
import { Button } from "@/components/ui/button";
import type { ShopCatalogue } from "@/domain/web";
import { useFormat, useMessages } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { ExternalLink } from "./web-results";
import { BarList, exactPrice, StatGrid, StatTile } from "./web-visuals";

/** What a Shopify shop publishes about its products: never about its sales. */
export function CatalogueBlock({ catalogue, currency, onCheck }: { readonly catalogue: ShopCatalogue; readonly currency: string | null; readonly onCheck: (url: string) => void }) {
  const m = useMessages("web").competitor;
  const f = useFormat();
  const money = (value: number) => exactPrice(f, value, currency);
  // Over a partial catalogue, a count only speaks for the products read.
  const note = catalogue.capped ? t(m.catOfRead, { count: f.int(catalogue.counted) }) : undefined;

  return (
    <section className="panel flex flex-col gap-6 p-5 sm:p-6" aria-labelledby="catalogue-title">
      <div>
        <h2 id="catalogue-title" className="flex items-center gap-2 text-base font-semibold">
          <KindMarker kind="observed" />
          {m.catalogueTitle}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{m.catalogueIntro}</p>
      </div>

      <StatGrid>
        <StatTile label={m.catProducts} value={catalogue.capped ? t(m.catAtLeast, { count: f.int(catalogue.counted) }) : f.int(catalogue.counted)} />
        {catalogue.priceMedian !== null && <StatTile label={m.catMedian} value={money(catalogue.priceMedian)} />}
        <StatTile label={m.catRecent} value={f.int(catalogue.addedLast90Days)} note={note} />
        <StatTile label={m.catDiscounted} value={f.int(catalogue.discounted)} note={note} />
        {catalogue.priceMin !== null && catalogue.priceMax !== null && <StatTile label={m.catRange} value={`${money(catalogue.priceMin)} – ${money(catalogue.priceMax)}`} />}
        <StatTile label={m.catInStock} value={f.int(catalogue.inStock)} note={note} />
        {catalogue.oldestPublishedAt && <StatTile label={m.catOldest} value={f.day(catalogue.oldestPublishedAt)} />}
      </StatGrid>

      {catalogue.priceBands.length > 1 && (
        <BarList
          title={m.bandsTitle}
          bars={catalogue.priceBands.map((band) => ({
            key: String(band.from),
            label: `${money(band.from)} – ${money(band.to)}`,
            value: band.count,
            display: `${f.int(band.count)} ${m.productsUnit}`,
          }))}
        />
      )}

      {catalogue.brands.length > 1 && (
        <BarList
          title={m.brandsTitle}
          bars={catalogue.brands.map((brand) => ({ key: brand.name, label: brand.name, value: brand.count, display: `${f.int(brand.count)} ${m.productsUnit}` }))}
        />
      )}

      {catalogue.newest.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">{m.newestTitle}</h3>
          <ul className="mt-2 divide-y divide-line">
            {catalogue.newest.map((product) => (
              <li key={product.url} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium break-words">
                    <ExternalLink href={product.url}>{product.title}</ExternalLink>
                  </p>
                  <p className="tabular mt-0.5 text-xs text-muted-foreground">
                    {[product.price === null ? null : money(product.price), product.publishedAt ? f.day(product.publishedAt) : null].filter(Boolean).join(", ")}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => onCheck(product.url)}>
                  {m.check}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** The page describes no product: says so, and offers the way forward. */
export function NotProductNotice({ links, hasCatalogue, onCheck }: { readonly links: readonly string[]; readonly hasCatalogue: boolean; readonly onCheck: (url: string) => void }) {
  const m = useMessages("web").competitor;
  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="not-product-title" role="status">
      <h2 id="not-product-title" className="text-base font-semibold">
        {m.notProductTitle}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{hasCatalogue || links.length > 0 ? m.notProductBody : m.notProductNoLinks}</p>
      {links.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-medium">{m.productsFound}</h3>
          <ul className="mt-2 divide-y divide-line">
            {links.map((link) => (
              <li key={link} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2.5">
                <span className="min-w-0 flex-1 text-sm break-all">
                  <ExternalLink href={link}>{new URL(link).pathname}</ExternalLink>
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => onCheck(link)}>
                  {m.check}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
