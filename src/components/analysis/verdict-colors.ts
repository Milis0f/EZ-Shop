import type { VerdictValue } from "@/engine/report/verdict";

/** The only hues of the interface: one per verdict. A plain module, readable by Server Components too. */
export const VERDICT_COLOR: Readonly<Record<VerdictValue, string>> = {
  oui: "var(--verdict-oui)",
  surveiller: "var(--verdict-surveiller)",
  non: "var(--verdict-non)",
};
