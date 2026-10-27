import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { DatumValue } from "@/components/data/datum-value";
import { Stat } from "@/components/country/panels";
import { isKnown, type Datum } from "@/domain/datum";
import { originName, type OriginCode } from "@/domain/origin";
import type { HsClassification, SourcingOffer } from "@/domain/signals";
import { formatInt, formatMoney } from "@/lib/format";

interface SourcingPanelProps {
  readonly origin?: OriginCode;
  readonly classification?: Datum<HsClassification>;
  readonly sourcing?: Datum<SourcingOffer>;
}

/** 6115 95 00 00; a prefix shorter than 6 digits covers a group of lines: "6115 9x". */
const formatHs = (code: string) =>
  code.length < 6 && code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}${"x".repeat(6 - code.length)}` : (code.match(/^\d{4}|\d{2}/g) ?? [code]).join(" ");

/** What the product costs to source and how customs see it: shared by every country of the analysis. */
export function SourcingPanel({ origin, classification, sourcing }: SourcingPanelProps) {
  if (!classification && !sourcing) return null;
  return (
    <div className="panel grid min-w-0 gap-8 p-5 sm:p-[26px] min-[900px]:grid-cols-[22rem_minmax(0,1fr)] min-[900px]:gap-12">
      <dl className="grid content-start gap-6">
        <Stat label="Pays d'origine">{origin ? originName(origin) : <span className="text-muted-foreground">Non renseigné</span>}</Stat>
        {classification && (
          <Stat
            label="Code douanier (SH)"
            hint={isKnown(classification) ? (classification.value.method === "user" ? "Saisi dans le formulaire" : "Proposé par la recherche du tarif : à vérifier") : undefined}
          >
            <DatumValue
              datum={classification}
              format={(c) => (
                <span className="flex flex-col">
                  <span className="font-medium">{formatHs(c.code)}</span>
                  <span className="text-xs text-muted-foreground">{c.description}</span>
                </span>
              )}
            />
          </Stat>
        )}
        {classification && !isKnown(classification) && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Sans code, les droits de douane restent non calculés. Ajoute une ligne « en: … » ou le code SH dans une nouvelle analyse.
          </p>
        )}
      </dl>

      <div className="min-w-0 min-[900px]:border-l min-[900px]:border-line min-[900px]:pl-12">
        <h3 className="text-sm font-medium">Prix d&apos;achat sur AliExpress</h3>
        {!sourcing || !isKnown(sourcing) ? (
          <div className="mt-3 text-sm">
            {sourcing && <DatumValue datum={sourcing} format={() => null} />}
            <p className="mt-2 text-xs text-muted-foreground">
              Connecte l&apos;API AliExpress pour obtenir le coût d&apos;achat réel sans le saisir.{" "}
              <Link href="/connectors" className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline">
                Sources de données
                <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            </p>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-3">
              <Stat label="Prix médian" hint="Hors livraison">
                <DatumValue datum={sourcing} format={(s) => <AnimatedNumber value={s.priceEur.median} format="money" />} />
              </Stat>
              <Stat label="Fourchette (P25 à P75)">
                <DatumValue datum={sourcing} format={(s) => `${formatMoney(s.priceEur.p25)} à ${formatMoney(s.priceEur.p75)}`} />
              </Stat>
              <Stat label="Ventes récentes" hint={`Sur ${sourcing.value.sampled} produits les plus vendus`}>
                <DatumValue datum={sourcing} format={(s) => (s.recentOrders === null ? "—" : <AnimatedNumber value={s.recentOrders} format="int" />)} />
              </Stat>
            </dl>
            <ul className="mt-6 flex flex-col gap-1.5">
              {sourcing.value.topProducts.map((p) => (
                <li key={p.url || p.title} className="flex items-center justify-between gap-4 rounded-tile bg-surface-2/50 px-4 py-3 text-sm">
                  <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-4 hover:underline">
                    {p.title}
                  </a>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{formatMoney(p.priceEur)}</span>
                    {p.orders !== null && <>, {formatInt(p.orders)} ventes</>}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
