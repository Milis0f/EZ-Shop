"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ez-connectors-seen";

type Seen = Record<string, boolean>;

function readSeen(): Seen {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Seen) : {};
  } catch {
    return {};
  }
}

function writeSeen(seen: Seen): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked (private mode): the feedback is a convenience, nothing else depends on it.
  }
}

interface ConnectorFrameProps {
  readonly id: string;
  readonly ready: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Card shell that remembers, in this browser only, whether each source was ready at the last visit.
 * A source seen as not ready and now ready gets data-fresh: a short ring and a "newly connected" note.
 * A source seen for the first time is never flagged. The DOM is updated directly: no extra render.
 */
export function ConnectorFrame({ id, ready, className, children }: ConnectorFrameProps) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const seen = readSeen();
    if (seen[id] === false && ready && ref.current) ref.current.dataset.fresh = "true";
    writeSeen({ ...seen, [id]: ready });
  }, [id, ready]);

  return (
    <li ref={ref} className={cn("group/connector data-[fresh=true]:animate-ready", className)}>
      {children}
    </li>
  );
}

/** Shown only inside a fresh ConnectorFrame. */
export function FreshNote() {
  return (
    <span className="hidden items-center gap-1.5 text-xs text-kind-observed group-data-[fresh=true]/connector:inline-flex">
      Branchée depuis ta dernière visite
    </span>
  );
}
