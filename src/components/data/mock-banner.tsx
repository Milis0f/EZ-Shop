"use client";

import { History } from "lucide-react";
import { useLocale } from "@/i18n/client";
import { advancedMessages } from "./labels";

/** Shown on stored pre-V1 analyses whose `dataMode` is `mock`: every number on the page is synthetic. */
export function MockBanner() {
  const m = advancedMessages(useLocale()).data;
  return (
    <div role="status" data-legacy-mock="" className="mb-8 flex items-start gap-3 rounded-tile border border-line bg-surface px-4 py-3 text-sm">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>{m.legacyMock}</p>
    </div>
  );
}
