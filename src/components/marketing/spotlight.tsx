"use client";

import type { PointerEvent, ReactNode } from "react";
import "./marketing.css";

/** Lights the edge of the `.spot` tile under the pointer. One listener for the whole group. */
export function SpotlightArea({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>(".spot");
    if (!tile) return;
    const box = tile.getBoundingClientRect();
    tile.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
    tile.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
  };
  return (
    <div className={className} onPointerMove={onMove}>
      {children}
    </div>
  );
}
