import { advancedMessages } from "@/components/data/labels";
import type { AnalysisResult } from "@/domain/analysis";
import type { LanguageCode } from "@/domain/country";
import { languageName } from "@/engine/report/localize";
import type { Locale } from "@/i18n/config";
import { formatDate, formatInt } from "@/i18n/format";
import { plural, t } from "@/i18n/translate";

export function AnalysisHeader({ analysis, locale }: { analysis: AnalysisResult; locale: Locale }) {
  const m = advancedMessages(locale).header;
  const byLanguage = new Map<LanguageCode, string[]>();
  for (const term of analysis.product.terms) byLanguage.set(term.language, [...(byLanguage.get(term.language) ?? []), term.term]);
  const count = analysis.countries.length;

  return (
    <header className="animate-enter mb-10">
      <h1 className="font-display text-[34px] leading-[1.08] font-bold tracking-[-0.035em] break-words sm:text-[48px]">{analysis.product.displayName}</h1>
      <dl className="mt-6 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-3">
        <dt className="text-muted-foreground">{m.terms}</dt>
        <dd className="mb-2 flex flex-wrap gap-x-4 gap-y-1 sm:mb-0">
          {[...byLanguage.entries()].map(([lang, terms]) => (
            <span key={lang}>
              <span className="text-muted-foreground">{languageName(lang, locale)} </span>
              {terms.join(", ")}
            </span>
          ))}
        </dd>
        <dt className="text-muted-foreground">{m.analysis}</dt>
        <dd>
          {plural(locale, count, m.meta, { count: formatInt(count, locale), date: formatDate(analysis.createdAt, locale), model: analysis.modelVersion })}
        </dd>
      </dl>
      {analysis.status === "failed" && (
        <p role="alert" className="mt-4 text-sm text-decision-avoid">
          {t(m.failed, { error: analysis.error ?? m.unknownError })}
        </p>
      )}
    </header>
  );
}
