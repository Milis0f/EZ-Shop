import type { DeepStringShape } from "./types";

/** App shell: layout metadata, navigation, mode toggle, language switcher, 404 page. */
export const en = {
  metadata: {
    description: "Estimate a product's commercial potential before launch, country by country, from traceable external data.",
  },
  tagline: "Product potential before launch",
  mainNav: "Main navigation",
  valuesLegend: "Reading the values",
  nav: {
    newAnalysis: "New analysis",
    newAnalysisShort: "Analyse",
    recent: "Recent analyses",
    recentShort: "Recent",
    sources: "Data sources",
    sourcesShort: "Sources",
    method: "Method",
    methodShort: "Method",
  },
  mode: { advanced: "Advanced mode", simple: "Simple mode" },
  language: { label: "Language", change: "Change language" },
  notFound: {
    title: "Page not found",
    body: "This analysis or country does not exist, or the ID is wrong.",
    back: "Back to analyses",
  },
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  metadata: {
    description: "Estimer le potentiel commercial d'un produit avant lancement, pays par pays, à partir de données externes traçables.",
  },
  tagline: "Potentiel produit avant lancement",
  mainNav: "Navigation principale",
  valuesLegend: "Lecture des valeurs",
  nav: {
    newAnalysis: "Nouvelle analyse",
    newAnalysisShort: "Analyser",
    recent: "Analyses récentes",
    recentShort: "Récentes",
    sources: "Sources de données",
    sourcesShort: "Sources",
    method: "Méthode",
    methodShort: "Méthode",
  },
  mode: { advanced: "Mode avancé", simple: "Mode simple" },
  language: { label: "Langue", change: "Changer de langue" },
  notFound: {
    title: "Page introuvable",
    body: "Cette analyse ou ce pays n'existe pas, ou l'identifiant est incorrect.",
    back: "Revenir aux analyses",
  },
};

export const es: Shape = {
  metadata: {
    description: "Estima el potencial comercial de un producto antes de lanzarlo, país por país, con datos externos trazables.",
  },
  tagline: "Potencial del producto antes del lanzamiento",
  mainNav: "Navegación principal",
  valuesLegend: "Cómo leer los valores",
  nav: {
    newAnalysis: "Nuevo análisis",
    newAnalysisShort: "Analizar",
    recent: "Análisis recientes",
    recentShort: "Recientes",
    sources: "Fuentes de datos",
    sourcesShort: "Fuentes",
    method: "Método",
    methodShort: "Método",
  },
  mode: { advanced: "Modo avanzado", simple: "Modo simple" },
  language: { label: "Idioma", change: "Cambiar de idioma" },
  notFound: {
    title: "Página no encontrada",
    body: "Este análisis o este país no existe, o el identificador es incorrecto.",
    back: "Volver a los análisis",
  },
};
