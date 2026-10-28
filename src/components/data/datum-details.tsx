"use client";

import { useLocale } from "@/i18n/client";
import { t } from "@/i18n/translate";
import { sourceName } from "@/engine/report/localize";
import { advancedMessages, missingLabel } from "./labels";
import type { MarkerKind } from "./kind-marker";
import { engineText } from "./engine-text";

/**
 * The localized text of DatumValue. DatumValue itself stays a Server Component (it takes a format
 * function), so only these small text parts read the locale on the client.
 */

export function InsufficientShort() {
  return <>{advancedMessages(useLocale()).data.insufficientShort}</>;
}

export function InsufficientDetails({ reason, missing }: { reason: string; missing: readonly string[] }) {
  const locale = useLocale();
  const m = advancedMessages(locale).data;
  return (
    <>
      <p className="font-medium">{engineText(reason, locale)}</p>
      {missing.length > 0 && <p className="mt-1 opacity-80">{t(m.missing, { list: missing.map((k) => missingLabel(k, locale)).join(", ") })}</p>}
    </>
  );
}

interface DatumDetailsProps {
  readonly kind: Exclude<MarkerKind, "insufficient" | "mock">;
  readonly mock: boolean;
  readonly sourceIds: readonly string[];
  readonly periods: readonly string[];
  readonly method?: string;
  readonly assumptionKeys?: readonly string[];
  readonly note?: string;
}

export function DatumDetails({ kind, mock, sourceIds, periods, method, assumptionKeys, note }: DatumDetailsProps) {
  const locale = useLocale();
  const m = advancedMessages(locale).data;
  const sources = [...new Set(sourceIds.map((id) => sourceName(id, locale)))];
  return (
    <div className="space-y-1">
      <p className="font-medium">
        {m.kinds[kind]}
        {mock && m.mockSuffix}
      </p>
      {sources.length > 0 && <p>{t(m.sources, { list: sources.join(", ") })}</p>}
      {periods.length > 0 && <p>{t(m.period, { list: periods.join(" ; ") })}</p>}
      {method && <p className="opacity-80">{t(m.method, { method })}</p>}
      {assumptionKeys && assumptionKeys.length > 0 && <p className="opacity-80">{t(m.assumptions, { list: assumptionKeys.join(", ") })}</p>}
      {note && <p className="opacity-80">{engineText(note, locale)}</p>}
    </div>
  );
}
