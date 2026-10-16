"use client";

import { CircleCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Shown once right after an analysis is created (?created=1). The flag is removed from the URL
 * so a refresh or a shared link does not show it again.
 */
export function SuccessNotice({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("created")) {
      url.searchParams.delete("created");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  if (!visible) return null;
  return (
    <div role="status" className="animate-slide-down mb-8 flex items-center gap-3 rounded-xl border border-kind-observed/30 bg-kind-observed/8 px-4 py-3 text-sm">
      <CircleCheck className="size-4 shrink-0 text-kind-observed" aria-hidden />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Masquer"
        className="interactive rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
