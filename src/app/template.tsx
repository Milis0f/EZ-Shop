import type { ReactNode } from "react";

/**
 * Re-mounted on every navigation (unlike layouts): carries the short page transition.
 * Under prefers-reduced-motion the animation resolves instantly (globals.css).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-page">{children}</div>;
}
