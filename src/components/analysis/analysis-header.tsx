import type { AnalysisResult } from "@/domain/analysis";
import { LANGUAGE_LABELS_FR, type LanguageCode } from "@/domain/country";
import { formatDate } from "@/lib/format";

export function AnalysisHeader({ analysis }: { analysis: AnalysisResult }) {
  const byLanguage = new Map<LanguageCode, string[]>();
  for (const t of analysis.product.terms) byLanguage.set(t.language, [...(byLanguage.get(t.language) ?? []), t.term]);

  return (
    <header className="animate-enter mb-10">
      <h1 className="font-display text-[34px] leading-[1.08] font-bold tracking-[-0.035em] break-words sm:text-[48px]">{analysis.product.displayName}</h1>
      <dl className="mt-6 grid gap-x-10 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-3">
        <dt className="text-muted-foreground">Termes analysés</dt>
        <dd className="mb-2 flex flex-wrap gap-x-4 gap-y-1 sm:mb-0">
          {[...byLanguage.entries()].map(([lang, terms]) => (
            <span key={lang}>
              <span className="text-muted-foreground">{LANGUAGE_LABELS_FR[lang]} </span>
              {terms.join(", ")}
            </span>
          ))}
        </dd>
        <dt className="text-muted-foreground">Analyse</dt>
        <dd>
          {formatDate(analysis.createdAt)}, {analysis.countries.length} pays, modèle de score {analysis.modelVersion}
        </dd>
      </dl>
      {analysis.status === "failed" && (
        <p role="alert" className="mt-4 text-sm text-decision-avoid">
          L&apos;analyse a échoué : {analysis.error ?? "erreur inconnue"}.
        </p>
      )}
    </header>
  );
}
