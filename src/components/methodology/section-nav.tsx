"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SectionNavProps {
  readonly items: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  /** Accessible name of the navigation, in the active locale. */
  readonly label: string;
}

/** Table of contents that follows the reading position. Plain anchors: works without JS. */
export function SectionNav({ items, label }: SectionNavProps) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).toSorted((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // A section is "current" while its top sits in the upper third of the viewport.
      { rootMargin: "-15% 0px -65% 0px" },
    );
    for (const { id } of items) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label={label}>
      <ul className="space-y-1 text-sm">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "block rounded-pill px-4 py-2 transition-colors duration-[var(--dur-base)] ease-[var(--ease-out)]",
                  current ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
