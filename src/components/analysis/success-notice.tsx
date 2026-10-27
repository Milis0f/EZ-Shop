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
    <div role="status" className="animate-slide-down mb-8 flex items-center gap-3 rounded-pill border border-line bg-surface py-2 pr-2 pl-5 text-sm">
      <CircleCheck className="size-4 shrink-0 text-kind-observed" aria-hidden />
      <p className="flex-1">{message}</p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Masquer"
        className="interactive grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-[var(--dur-fast)] hover:bg-surface-2 hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
