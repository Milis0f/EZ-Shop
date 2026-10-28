import type { DeepStringShape } from "./types";

/** Words shared by several areas. Owner: i18n foundation; add here only what two areas or more need. */
export const en = {
  /** The three verdict words, as shown on the report and in the method. */
  verdict: { yes: "YES", no: "NO", watch: "WATCH" },
  /** Human label next to the literal DATA_INSUFFICIENT marker (the marker itself is never translated). */
  insufficientData: "Insufficient data",
  loading: "Loading…",
  notAvailable: "Not available",
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  verdict: { yes: "OUI", no: "NON", watch: "À SURVEILLER" },
  insufficientData: "Données insuffisantes",
  loading: "Chargement…",
  notAvailable: "Non disponible",
};

export const es: Shape = {
  verdict: { yes: "SÍ", no: "NO", watch: "VIGILAR" },
  insufficientData: "Datos insuficientes",
  loading: "Cargando…",
  notAvailable: "No disponible",
};
