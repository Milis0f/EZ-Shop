import { History } from "lucide-react";

export const LEGACY_MOCK_NOTICE = "Analyse fictive ancienne, créée avant la V1 : ses chiffres ne sont pas réels.";

/** Shown on stored pre-V1 analyses whose `dataMode` is `mock`: every number on the page is synthetic. */
export function MockBanner() {
  return (
    <div role="status" className="mb-8 flex items-start gap-3 rounded-tile border border-line bg-surface px-4 py-3 text-sm">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p>{LEGACY_MOCK_NOTICE}</p>
    </div>
  );
}
