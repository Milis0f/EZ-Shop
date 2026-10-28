import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { CompactOrb } from "@/components/analysis/compact-orb";
import { ConfidenceMeter, ScoreMeter } from "@/components/analysis/meters";
import { DatumValue } from "@/components/data/datum-value";
import { LegacyMockNotice } from "@/components/data/legacy-mock-notice";
import { DemandChart } from "@/components/country/demand-chart";
import { AdCostsTable, CompetitionPanel, KeyFigures, MarketPanel, SalesPanel } from "@/components/country/panels";
import { ProvenancePanel } from "@/components/country/provenance-panel";
import { ConfidencePanel, CriteriaBreakdown } from "@/components/country/score-breakdown";
import { SeasonalityChart } from "@/components/country/seasonality-chart";
import { InterestPanel, MarketplacePanel, TaxesPanel } from "@/components/country/signals-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryTag } from "@/components/data/country-tag";
import { advancedMessages, missingLabel, originCountryName } from "@/components/data/labels";
import { COUNTRIES, isCountryCode } from "@/domain/country";
import { isKnown } from "@/domain/datum";
import { countryName, languageName, reasonText } from "@/engine/report/localize";
import { verdictFor } from "@/engine/report/verdict";
import type { Locale } from "@/i18n/config";
import { formatInt, formatPct } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import { t } from "@/i18n/translate";
import { getAnalysis } from "@/server/services";
import { engineText } from "@/components/data/engine-text";

interface PageProps {
  readonly params: Promise<{ id: string; country: string }>;
}

/** Tab title: the product name and the country, read at request time like the page itself. */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [{ id, country: raw }, locale] = await Promise.all([params, getLocale()]);
  const m = advancedMessages(locale);
  const code = raw.toUpperCase();
  if (!isCountryCode(code)) return { title: m.country.notFound };
  await connection();
  const analysis = await getAnalysis(id);
  return { title: analysis ? `${analysis.product.displayName}, ${countryName(code, locale)}` : m.page.notFound };
}

export default async function CountryPage({ params }: PageProps) {
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-7xl min-w-0 pb-16">
      <Suspense fallback={<CountrySkeleton locale={locale} />}>
        <CountryContent params={params} locale={locale} />
      </Suspense>
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-16 scroll-mt-8">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {intro && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Missing series: says why, and where to fix it. Never an empty chart frame. */
interface InsufficientBlockProps {
  readonly reason: string;
  readonly missing: readonly string[];
  readonly locale: Locale;
  readonly className?: string;
}

function InsufficientBlock({ reason, missing, locale, className }: InsufficientBlockProps) {
  const m = advancedMessages(locale).country;
  return (
    <div className={`hatch flex flex-col items-center justify-center gap-3 rounded-tile border border-dashed border-line px-6 py-8 text-center ${className ?? ""}`}>
      <p className="max-w-sm text-sm">{engineText(reason, locale)}</p>
      {missing.length > 0 && <p className="text-xs text-muted-foreground">{t(m.missing, { list: missing.map((k) => missingLabel(k, locale)).join(", ") })}</p>}
      <Link
        href="/connectors"
        className="inline-flex items-center rounded-pill border border-line bg-surface-2 px-4 py-2 text-xs font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:border-foreground/40"
      >
        {m.seeSources}
      </Link>
    </div>
  );
}

async function CountryContent({ params, locale }: PageProps & { locale: Locale }) {
  const { id, country: raw } = await params;
  const code = raw.toUpperCase();
  if (!isCountryCode(code)) notFound();
  await connection();
  const analysis = await getAnalysis(id);
  const c = analysis?.countries.find((x) => x.country === code);
  if (!analysis || !c) notFound();

  const all = advancedMessages(locale);
  const m = all.country;
  const s = m.sections;
  const country = COUNTRIES[code];
  const { demand, scoring } = c;
  const history = isKnown(demand.history) ? demand.history.value : null;
  const forecast = isKnown(demand.forecast) ? demand.forecast.value.points : null;
  const verdict = verdictFor(c);
  const origin = analysis.input.originCountry ? originCountryName(analysis.input.originCountry, locale) : m.unknownOrigin;

  return (
    <>
      <Link
        href={`/analyses/${analysis.id}`}
        className="interactive group inline-flex max-w-full items-center gap-2 rounded-pill border border-line bg-surface py-2 pr-4 pl-3 text-sm text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform duration-[var(--dur-fast)] group-hover:-translate-x-0.5" aria-hidden />
        <span className="truncate">{t(m.back, { product: analysis.product.displayName })}</span>
      </Link>

      <header className="animate-enter mt-8 mb-10">
        <LegacyMockNotice dataMode={analysis.dataMode} />
        <div className="grid grid-cols-1 items-center gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:gap-10">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {countryName(code, locale)}
              <CountryTag code={code} className="text-xs" />
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {t(m.terms, { language: languageName(c.terms[0]?.language ?? country.languages[0], locale) })}{" "}
              <span className="text-foreground">{c.terms.map((t) => t.term).join(", ")}</span>
            </p>
            {c.languageMismatch && (
              <p className="mt-2 text-sm text-muted-foreground">{m.languageMismatch}</p>
            )}
          </div>
          <div className="panel grid min-w-0 gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-[26px] min-[900px]:w-[34rem]">
            <div className="justify-self-center">
              <CompactOrb verdict={verdict} confidence={scoring.confidence.score} />
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-relaxed">{reasonText(verdict.cause, locale)}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{all.labels.decisionHints[scoring.decision]}</p>
              <dl className="mt-5 grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{m.opportunityScore}</dt>
                  <dd className="mt-1.5">
                    {isKnown(scoring.score) ? (
                      <ScoreMeter value={scoring.score.value.total} />
                    ) : (
                      <DatumValue datum={scoring.score} format={() => null} />
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{m.confidence}</dt>
                  <dd className="mt-1.5">
                    <ConfidenceMeter value={scoring.confidence.score} />
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </header>

      <KeyFigures c={c} locale={locale} />

      <Section
        id="demand"
        title={s.demand.title}
        intro={s.demand.intro}
      >
        <div className="panel grid min-w-0 gap-8 p-5 sm:p-[26px] min-[900px]:grid-cols-[minmax(0,1fr)_20rem] min-[900px]:gap-12">
          {history ? (
            <DemandChart basis={history.basis} history={history.series} forecast={forecast} />
          ) : (
            !isKnown(demand.history) && <InsufficientBlock reason={demand.history.reason} missing={demand.history.missing} locale={locale} className="h-72" />
          )}
          <div className="min-w-0 min-[900px]:border-l min-[900px]:border-line min-[900px]:pl-10">
            <h3 className="text-sm font-medium">{s.seasonality}</h3>
            {isKnown(demand.seasonality) ? (
              <>
                <SeasonalityChart monthlyIndex={demand.seasonality.value.monthlyIndex} peakMonths={demand.seasonality.value.peakMonths} />
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(s.seasonalityNote, {
                    strength: formatPct(Math.round(demand.seasonality.value.strength * 100), locale),
                    years: formatInt(demand.seasonality.value.yearsUsed, locale),
                  })}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm">
                <DatumValue datum={demand.seasonality} format={() => null} />
              </p>
            )}
          </div>
        </div>
      </Section>

      {c.signals && (
        <Section
          id="interest"
          title={s.interest.title}
          intro={s.interest.intro}
        >
          <InterestPanel signals={c.signals} locale={locale} />
        </Section>
      )}

      <Section
        id="sales"
        title={s.sales.title}
        intro={s.sales.intro}
      >
        <SalesPanel c={c} economics={analysis.economics} locale={locale} />
        <h3 className="mt-10 mb-4 text-sm font-medium">{s.adCosts}</h3>
        <AdCostsTable c={c} locale={locale} />
      </Section>

      {c.signals && (
        <Section
          id="marketplace"
          title={s.marketplace.title}
          intro={s.marketplace.intro}
        >
          <MarketplacePanel signals={c.signals} locale={locale} />
        </Section>
      )}

      {c.signals && (
        <Section
          id="taxes"
          title={s.taxes.title}
          intro={t(s.taxes.intro, { origin })}
        >
          <TaxesPanel signals={c.signals} locale={locale} />
        </Section>
      )}

      <Section id="competition" title={s.competition.title} intro={s.competition.intro}>
        <CompetitionPanel c={c} locale={locale} />
      </Section>

      <Section id="score" title={s.score.title} intro={s.score.intro}>
        <CriteriaBreakdown scoring={scoring} locale={locale} />
      </Section>

      <Section id="confidence" title={s.confidence.title} intro={s.confidence.intro}>
        <ConfidencePanel confidence={scoring.confidence} locale={locale} />
      </Section>

      <Section id="market" title={s.market}>
        <MarketPanel c={c} locale={locale} />
      </Section>

      <Section id="provenance" title={s.provenance.title} intro={s.provenance.intro}>
        <ProvenancePanel c={c} locale={locale} />
      </Section>
    </>
  );
}

function CountrySkeleton({ locale }: { locale: Locale }) {
  return (
    <div role="status" aria-label={advancedMessages(locale).country.loading}>
      <Skeleton className="h-9 w-56 rounded-pill" />
      <div className="mt-8 grid grid-cols-1 items-center gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-4 h-4 w-80" />
        </div>
        <Skeleton className="h-52 w-[34rem] max-w-full rounded-panel" />
      </div>
      <Skeleton className="mt-10 h-24 rounded-panel" />
      <Skeleton className="mt-16 h-5 w-48" />
      <Skeleton className="mt-6 h-[22rem] rounded-panel" />
    </div>
  );
}
