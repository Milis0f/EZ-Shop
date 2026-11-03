"use client";

import { useEffect } from "react";
import type { AppMode } from "./mode";
import { setMode } from "./mode-toggle";

/** Chosen from the planet's menu: a simple or an in-depth analysis also opens its report that way. */
export function ModeSetter({ mode }: { readonly mode: AppMode }) {
  useEffect(() => {
    if (document.documentElement.dataset.mode !== mode) setMode(mode);
  }, [mode]);
  return null;
}
