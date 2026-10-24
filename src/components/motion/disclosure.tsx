"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Expand } from "./expand";

interface DisclosureProps {
  /** Always-visible row content; the whole row toggles the panel. */
  readonly summary: ReactNode;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly summaryClassName?: string;
}

/**
 * Accessible disclosure whose panel height animates smoothly (<Expand>: grid rows 0fr → 1fr),
 * in every modern browser. Content stays in the DOM, so it is searchable and printable.
 */
export function Disclosure({ summary, children, defaultOpen = false, className, summaryClassName }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;

  return (
    <div className={cn("group/disclosure", className)} data-open={open || undefined}>
      <button
        type="button"
        id={buttonId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-4 rounded-lg text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-2/60 focus-visible:outline-2",
          summaryClassName,
        )}
      >
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--dur-slow)] ease-[var(--ease-standard)]", open && "rotate-180")}
        />
      </button>
      <Expand open={open} id={panelId} role="region" aria-labelledby={buttonId}>
        {children}
      </Expand>
    </div>
  );
}
