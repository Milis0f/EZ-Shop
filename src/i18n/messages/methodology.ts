import type { DeepStringShape } from "./types";

/**
 * Method page (src/app/methodology, src/components/methodology), the motion lab dev page
 * (src/app/motion-lab) and the default assumption texts of src/config/assumptions.ts.
 * English first in `en` (as const), then the same keys in `fr` and `es`.
 */
export const en = {
  metadataTitle: "Method",
  title: "Method",
  intro:
    "Scoring model {version}. The analysis runs strictly at country level, on external data only: no sales, campaigns or store statistics enter the calculation.",
  tocLabel: "Contents",
  sections: {
    values: "Nature of the values",
    demand: "Demand",
    sales: "Sales and revenue",
    ads: "Advertising costs",
    score: "Opportunity score",
    confidence: "Confidence and decision",
    verdict: "Verdict",
    ai: "Local AI",
  },
  values: {
    body: "Every value shown carries its nature. Hover a value to see its method, sources and period.",
  },
  demand: {
    sources:
      "Absolute volumes: Google Ads Keyword Planner. Shape of demand: Google Trends (relative index 0–100). When both exist, the Trends index is scaled to the Keyword Planner volumes and their correlation feeds the confidence.",
    formula: "log(1 + demand) = a + b × month + month-of-year effect + error",
    limits:
      "Trend from {trendMonths} months; seasonality and forecast from {seasonMonths} months. The P10–P90 interval comes from the model's prediction error. Limitation: residual autocorrelation is ignored, so the real uncertainty is probably wider.",
  },
  sales: {
    formula: "orders = projected demand × captured share of demand × conversion rate",
    body:
      "Monte Carlo simulation with {draws} draws. Both rates are assumptions, shown in every analysis. Without an absolute search volume, no sales are estimated. Revenue requires a selling price.",
  },
  ads: {
    formula: "CPA = CPC ÷ conversion rate; test budget = CPA × target conversions",
    body:
      "Google: the Keyword Planner top-of-page bid range P20–P80 is used as a CPC proxy, probably an upper bound. Meta and TikTok: official estimates only through an ad account; otherwise, insufficient data.",
  },
  score: {
    intro: "{count} criteria, {total} points in total. The bar shows the weight of each criterion.",
    pointsUnit: "pts",
    rules:
      "Weights are renormalised over the available criteria. No score below {coverage} coverage, nor without a demand criterion. Capped at {cap} when the estimated CPA exceeds the margin. Normalisation bounds are absolute: a country's score does not depend on the other countries compared.",
  },
  criteria: {
    demand_volume: "Demand volume",
    demand_trend: "Historical trend",
    demand_outlook: "Future demand (12 months)",
    seasonality_timing: "Seasonal timing",
    competition_current: "Current competition",
    competition_trend: "Future competition",
    ad_cost: "Advertising cost",
    market_context: "Market context",
    unit_economics: "Unit economics",
    search_intent: "Related searches (Autocomplete)",
    video_interest: "Video interest (YouTube)",
    market_margin: "Margin at market price",
  },
  confidence: {
    formula: "confidence = coverage × freshness × source quality × cross-source consistency",
    body:
      "Always computed separately from the score. Decision: prioritise above a score of {prioritizeScore} with {prioritizeConfidence} confidence; test carefully from {testScore}; exploratory only below {minConfidence} confidence, whatever the score.",
  },
  decisions: {
    prioritize: "Prioritise",
    test_carefully: "Test carefully",
    avoid: "Avoid",
    exploratory_only: "Exploratory only",
    insufficient_data: "Insufficient data",
  },
  zones: {
    caption:
      "Horizontal: confidence (%). Vertical: opportunity score. Without a computable score, the decision is “{insufficient}”.",
  },
  verdict: {
    intro:
      "Each country gets a verdict, rule {rule}. It presents the decision above without changing the score, weights or thresholds, and adds blocking factors drawn only from your inputs and real data. The rule runs in table order: the first true row gives the verdict.",
    tableCaption: "Verdict rule verdict_v1, in the order it is applied",
    columns: { situation: "Situation", verdict: "Verdict", reason: "Reason shown" },
    rows: {
      blocking: { condition: "A blocking factor is known", reason: "The blocking factor" },
      insufficient: { condition: "Insufficient data: no score", reason: "The sources to connect" },
      exploratory: {
        condition: "Exploratory only: confidence below {minConfidence}",
        reason: "Confidence too low, with the weakest factor",
      },
      prioritize: {
        condition: "Prioritise: score of at least {prioritizeScore}, confidence of at least {prioritizeConfidence}",
        reason: "The strongest signals",
      },
      avoid: { condition: "Avoid: score below {testScore}", reason: "The weakest criteria" },
      test: {
        condition:
          "Test carefully: score of at least {testScore}, confidence of at least {minConfidence}, without reaching Prioritise",
        reason: "Mixed signals, with the strong point and the weak point",
      },
    },
    blockingIntro: "Blocking factors, each computed only when its data exists:",
    blocking: {
      loss: "a loss at your selling price, excluding VAT, after duties and shipping;",
      belowMinimum: "a planned price below the minimum price for your target margin, when both are entered;",
      noDemand: "no national demand data for the country: every source failed.",
    },
    unknownMargin: "An unknown margin is never blocking: without a price entered, the verdict stays that of the decision.",
  },
  ai: {
    intro:
      "The local AI rewords the saved analysis in plain sentences and suggests next steps. It collects nothing and produces no data: it only reads what the analysis contains.",
    model: "Model",
    license: "Licence",
    runsLocally:
      "The model runs on the graphics card of your own computer, with node-llama-cpp. No data leaves the machine: not the product, the analysis or the answer.",
    checks:
      "Every number the AI quotes is checked against the analysis. An answer containing a number that is not in the analysis is rejected and not shown. If the model cannot run, the reason is shown as is and nothing is generated in its place.",
  },
  assumptions: {
    userRationale: "Value entered by the user.",
    traffic_capture_share: {
      label: "Captured share of demand",
      description: "Share of the country's monthly searches turned into store visits (paid + organic).",
      rationale: "Cautious assumption for a new store with no brand awareness or SEO. Not observed.",
    },
    conversion_rate: {
      label: "Visit-to-order conversion rate",
      description: "Share of visits that end in an order.",
      rationale: "Conventional range for general e-commerce. Not observed for this product.",
    },
    social_ctr: {
      label: "Social ads CTR",
      description: "Click-through rate used to turn a Meta/TikTok CPM into a CPC.",
      rationale: "Conventional range for conversion campaigns. Not observed.",
    },
    test_target_conversions: {
      label: "Target conversions for a test",
      description: "Number of orders needed to judge an ad test.",
      rationale: "Decision threshold set by convention, editable.",
    },
  },
  motionLab: {
    metadataTitle: "Motion lab",
    title: "Motion lab (development)",
    intro:
      "Every primitive of the motion kit, with demo controls. No real data here: the values are made up and only serve to show the motion. This page does not exist in production.",
    replay: "Replay",
    ring: {
      title: "Circular gauge",
      hint: "The arc draws once from zero to the value when the gauge appears. A soft glow of the same colour, no shadow. After that, a value change glides to the new one.",
      demo: "Demo",
      value: "Sample value {value}",
      aria: "Demo gauge, sample value {value}",
      selectorAria: "Sample gauge value",
      swatchAria: "{name} colour, sample value {value}",
      swatches: { mint: "Mint", amber: "Amber", coral: "Coral" },
    },
    pending: {
      title: "Button with pending state",
      hint: "The label makes way for the ring without changing the button's width. The second one follows its local form (useFormStatus): nothing leaves the page.",
      analyse: "Analyse",
      analysing: "Analysis in progress",
      validate: "Validate the demo",
      validating: "Validating",
    },
    segmented: {
      title: "Segmented control",
      hint: "The thumb slides with a spring. With the keyboard: arrows, Home and End.",
      zoneAria: "Demo zone",
      france: "France",
      world: "Worldwide",
      periodAria: "Demo period",
      day: "Day",
      week: "Week",
      month: "Month",
    },
    reveal: {
      title: "Staggered entrance",
      hint: "Items rise and fade in once, one after the other (60 ms apart).",
      signals: {
        first: "First sample signal",
        second: "Second sample signal",
        third: "Third sample signal",
        fourth: "Fourth sample signal",
      },
    },
    draw: {
      title: "Line drawing",
      hint: "A solid line draws itself once when it becomes visible. Decorative curve, no data.",
      aria: "Decorative demo curve",
    },
    number: {
      title: "Animated number",
      hint: "Counts up once to its value when it appears, in tabular figures. Sample numbers.",
      number: "Sample number",
      percent: "Sample percentage",
    },
    expand: {
      title: "Expanding panel",
      hint: "The height follows the content, with no measuring. Closed content stays in the page but can no longer be reached.",
      show: "Show details",
      hide: "Hide details",
      content: "Demo content. It opens in height with a fade, and closes the same way.",
      disclosure: "Disclosure, same motion",
      disclosureBody: "The Disclosure component now uses Expand.",
    },
    viewTransition: {
      title: "View transition",
      hint: "A mode change goes through a View Transition when the browser supports it; otherwise it is instant.",
      aria: "Demo layout",
      compact: "Compact",
      detail: "Detailed",
      card: "Demo card",
      cardDetail: "In detailed mode, the card takes the full width and shows this extra text.",
    },
    loader: {
      title: "Loading ring",
      hint: "Inherits the text colour. Still when reduced motion is requested.",
      label: "Demo loading",
    },
    scrollReveal: {
      title: "Entrance on scroll",
      hint: "Plays once when the section enters the screen; if it is already visible on load, it plays right away.",
      tiles: { one: "Tile one", two: "Tile two", three: "Tile three" },
    },
  },
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  metadataTitle: "Méthode",
  title: "Méthode",
  intro:
    "Modèle de score {version}. Analyse strictement au niveau pays, uniquement sur des données externes : aucune vente, campagne ou statistique de boutique n'entre dans le calcul.",
  tocLabel: "Sommaire",
  sections: {
    values: "Nature des valeurs",
    demand: "Demande",
    sales: "Ventes et CA",
    ads: "Coûts publicitaires",
    score: "Score d'opportunité",
    confidence: "Confiance et décision",
    verdict: "Verdict",
    ai: "IA locale",
  },
  values: {
    body: "Chaque valeur affichée porte sa nature. Survoler une valeur montre sa méthode, ses sources et sa période.",
  },
  demand: {
    sources:
      "Volumes absolus : Google Ads Keyword Planner. Forme de la demande : Google Trends (indice relatif 0–100). Quand les deux existent, l'indice Trends est calé sur les volumes Keyword Planner et leur corrélation alimente la confiance.",
    formula: "log(1 + demande) = a + b × mois + effet du mois de l'année + erreur",
    limits:
      "Tendance dès {trendMonths} mois ; saisonnalité et prévision à partir de {seasonMonths} mois. L'intervalle P10–P90 vient de l'erreur de prédiction du modèle. Limite : l'autocorrélation des résidus est ignorée, l'incertitude réelle est probablement plus large.",
  },
  sales: {
    formula: "commandes = demande projetée × part de demande captée × taux de conversion",
    body:
      "Simulation Monte Carlo de {draws} tirages. Les deux taux sont des hypothèses affichées dans chaque analyse. Sans volume absolu de recherche, aucune vente n'est estimée. Le chiffre d'affaires exige un prix de vente saisi.",
  },
  ads: {
    formula: "CPA = CPC ÷ taux de conversion ; budget de test = CPA × conversions visées",
    body:
      "Google : l'enchère haut de page P20–P80 de Keyword Planner sert de proxy du CPC, probablement un majorant. Meta et TikTok : estimations officielles uniquement via un compte publicitaire ; sinon, données insuffisantes.",
  },
  score: {
    intro: "{count} critères, {total} points au total. La barre montre le poids de chaque critère.",
    pointsUnit: "pts",
    rules:
      "Les poids sont renormalisés sur les critères disponibles. Pas de score sous {coverage} de couverture, ni sans critère de demande. Plafond à {cap} quand le CPA estimé dépasse la marge. Les bornes de normalisation sont absolues : le score d'un pays ne dépend pas des autres pays comparés.",
  },
  criteria: {
    demand_volume: "Volume de demande",
    demand_trend: "Tendance historique",
    demand_outlook: "Demande future (12 mois)",
    seasonality_timing: "Timing saisonnier",
    competition_current: "Concurrence actuelle",
    competition_trend: "Concurrence future",
    ad_cost: "Coût publicitaire",
    market_context: "Contexte de marché",
    unit_economics: "Économie unitaire",
    search_intent: "Recherches associées (Autocomplete)",
    video_interest: "Intérêt vidéo (YouTube)",
    market_margin: "Marge au prix du marché",
  },
  confidence: {
    formula: "confiance = couverture × fraîcheur × qualité des sources × cohérence inter-sources",
    body:
      "Toujours calculée à part du score. Décision : prioriser au-delà d'un score de {prioritizeScore} avec {prioritizeConfidence} de confiance ; tester prudemment à partir de {testScore} ; exploratoire seulement sous {minConfidence} de confiance, quel que soit le score.",
  },
  decisions: {
    prioritize: "Prioriser",
    test_carefully: "Tester prudemment",
    avoid: "Éviter",
    exploratory_only: "Exploratoire seulement",
    insufficient_data: "Données insuffisantes",
  },
  zones: {
    caption:
      "Horizontal : confiance (%). Vertical : score d'opportunité. Sans score calculable, la décision est « {insufficient} ».",
  },
  verdict: {
    intro:
      "Chaque pays reçoit un verdict, règle {rule}. Il présente la décision ci-dessus sans changer le score, les poids ni les seuils, et ajoute des facteurs bloquants tirés uniquement de tes saisies et des données réelles. La règle s'applique dans l'ordre du tableau : la première ligne vraie donne le verdict.",
    tableCaption: "Règle de verdict verdict_v1, dans l'ordre où elle est appliquée",
    columns: { situation: "Situation", verdict: "Verdict", reason: "Raison affichée" },
    rows: {
      blocking: { condition: "Un facteur bloquant est connu", reason: "Le facteur bloquant" },
      insufficient: { condition: "Données insuffisantes : aucun score", reason: "Les sources à connecter" },
      exploratory: {
        condition: "Exploratoire seulement : confiance sous {minConfidence}",
        reason: "Confiance trop faible, avec le facteur le plus faible",
      },
      prioritize: {
        condition: "Prioriser : score d'au moins {prioritizeScore}, confiance d'au moins {prioritizeConfidence}",
        reason: "Les signaux les plus forts",
      },
      avoid: { condition: "Éviter : score sous {testScore}", reason: "Les critères les plus faibles" },
      test: {
        condition:
          "Tester prudemment : score d'au moins {testScore}, confiance d'au moins {minConfidence}, sans atteindre Prioriser",
        reason: "Signaux mitigés, avec le point fort et le point faible",
      },
    },
    blockingIntro: "Facteurs bloquants, chacun calculé seulement quand ses données existent :",
    blocking: {
      loss: "perte à ton prix de vente, hors TVA, après droits et livraison ;",
      belowMinimum: "prix prévu sous le prix minimum pour ta marge cible, quand les deux sont saisis ;",
      noDemand: "aucune donnée de demande nationale pour le pays : toutes les sources ont échoué.",
    },
    unknownMargin: "Une marge inconnue n'est jamais bloquante : sans prix saisi, le verdict reste celui de la décision.",
  },
  ai: {
    intro:
      "L'IA locale reformule l'analyse déjà enregistrée en phrases simples et propose des prochaines étapes. Elle ne collecte rien et ne produit aucune donnée : elle lit seulement ce que l'analyse contient.",
    model: "Modèle",
    license: "Licence",
    runsLocally:
      "Le modèle tourne sur la carte graphique de ton propre ordinateur, avec node-llama-cpp. Aucune donnée ne quitte la machine : ni le produit, ni l'analyse, ni la réponse.",
    checks:
      "Chaque nombre cité par l'IA est vérifié contre l'analyse. Une réponse qui contient un nombre absent de l'analyse est refusée et n'est pas affichée. Si le modèle ne peut pas tourner, la raison s'affiche telle quelle et rien n'est généré à sa place.",
  },
  assumptions: {
    userRationale: "Valeur saisie par l'utilisateur.",
    traffic_capture_share: {
      label: "Part de la demande captée",
      description: "Part des recherches mensuelles du pays transformées en visites sur la boutique (payant + organique).",
      rationale: "Hypothèse prudente pour une boutique neuve sans notoriété ni SEO. Non observée.",
    },
    conversion_rate: {
      label: "Taux de conversion visite → commande",
      description: "Proportion des visites qui aboutissent à une commande.",
      rationale: "Plage conventionnelle e-commerce généraliste. Non observée pour ce produit.",
    },
    social_ctr: {
      label: "CTR publicités sociales",
      description: "Taux de clic utilisé pour convertir un CPM Meta/TikTok en CPC.",
      rationale: "Plage conventionnelle pour des campagnes de conversion. Non observée.",
    },
    test_target_conversions: {
      label: "Conversions visées pour un test",
      description: "Nombre de commandes à obtenir pour juger un test publicitaire.",
      rationale: "Seuil de décision choisi par convention, modifiable.",
    },
  },
  motionLab: {
    metadataTitle: "Laboratoire d'animation",
    title: "Laboratoire d'animation (développement)",
    intro:
      "Chaque primitive du kit de mouvement, avec des contrôles de démonstration. Aucune donnée réelle ici : les valeurs sont fictives et servent seulement à voir le mouvement. Cette page n'existe pas en production.",
    replay: "Rejouer",
    ring: {
      title: "Jauge circulaire",
      hint: "L'arc se trace une fois de zéro à la valeur, quand la jauge apparaît. Un halo flou de la même couleur, sans ombre. Ensuite, un changement de valeur glisse jusqu'à la nouvelle.",
      demo: "Démo",
      value: "Valeur fictive {value}",
      aria: "Jauge de démonstration, valeur fictive {value}",
      selectorAria: "Valeur fictive de la jauge",
      swatchAria: "Couleur {name}, valeur fictive {value}",
      swatches: { mint: "Menthe", amber: "Ambre", coral: "Corail" },
    },
    pending: {
      title: "Bouton avec attente",
      hint: "Le libellé laisse la place à l'anneau sans changer la largeur du bouton. Le second suit son formulaire local (useFormStatus) : rien ne quitte la page.",
      analyse: "Analyser",
      analysing: "Analyse en cours",
      validate: "Valider la démo",
      validating: "Validation en cours",
    },
    segmented: {
      title: "Sélecteur segmenté",
      hint: "Le curseur glisse avec un ressort. Au clavier : flèches, Début et Fin.",
      zoneAria: "Zone de démonstration",
      france: "France",
      world: "Monde entier",
      periodAria: "Période de démonstration",
      day: "Jour",
      week: "Semaine",
      month: "Mois",
    },
    reveal: {
      title: "Apparition échelonnée",
      hint: "Les éléments montent et apparaissent une seule fois, l'un après l'autre (60 ms d'écart).",
      signals: {
        first: "Premier signal fictif",
        second: "Deuxième signal fictif",
        third: "Troisième signal fictif",
        fourth: "Quatrième signal fictif",
      },
    },
    draw: {
      title: "Tracé de courbe",
      hint: "Une ligne pleine se dessine une fois quand elle devient visible. Courbe décorative, sans données.",
      aria: "Courbe décorative de démonstration",
    },
    number: {
      title: "Nombre animé",
      hint: "Compte une fois jusqu'à sa valeur quand il apparaît, en chiffres tabulaires. Nombres fictifs.",
      number: "Nombre fictif",
      percent: "Pourcentage fictif",
    },
    expand: {
      title: "Panneau extensible",
      hint: "La hauteur suit le contenu, sans mesure. Le contenu fermé reste dans la page mais n'est plus atteignable.",
      show: "Afficher le détail",
      hide: "Masquer le détail",
      content: "Contenu de démonstration. Il s'ouvre en hauteur et en fondu, et se referme de la même manière.",
      disclosure: "Disclosure, même mouvement",
      disclosureBody: "Le composant Disclosure utilise maintenant Expand.",
    },
    viewTransition: {
      title: "Transition de vue",
      hint: "Un changement de mode passe par une View Transition quand le navigateur le permet, sinon il est immédiat.",
      aria: "Affichage de démonstration",
      compact: "Compact",
      detail: "Détaillé",
      card: "Carte de démonstration",
      cardDetail: "En mode détaillé, la carte prend toute la largeur et montre ce texte en plus.",
    },
    loader: {
      title: "Anneau de chargement",
      hint: "Hérite de la couleur du texte. Immobile si le mouvement réduit est demandé.",
      label: "Chargement de démonstration",
    },
    scrollReveal: {
      title: "Apparition au défilement",
      hint: "Joue une fois quand la section entre à l'écran ; déjà visible au chargement, elle joue tout de suite.",
      tiles: { one: "Tuile une", two: "Tuile deux", three: "Tuile trois" },
    },
  },
};

export const es: Shape = {
  metadataTitle: "Método",
  title: "Método",
  intro:
    "Modelo de puntuación {version}. El análisis se hace estrictamente por país y solo con datos externos: ninguna venta, campaña ni estadística de tienda entra en el cálculo.",
  tocLabel: "Índice",
  sections: {
    values: "Naturaleza de los valores",
    demand: "Demanda",
    sales: "Ventas y facturación",
    ads: "Costes publicitarios",
    score: "Puntuación de oportunidad",
    confidence: "Confianza y decisión",
    verdict: "Veredicto",
    ai: "IA local",
  },
  values: {
    body: "Cada valor mostrado indica su naturaleza. Al pasar el cursor sobre un valor se ven su método, sus fuentes y su periodo.",
  },
  demand: {
    sources:
      "Volúmenes absolutos: Google Ads Keyword Planner. Forma de la demanda: Google Trends (índice relativo 0–100). Cuando existen ambos, el índice de Trends se ajusta a los volúmenes de Keyword Planner y su correlación alimenta la confianza.",
    formula: "log(1 + demanda) = a + b × mes + efecto del mes del año + error",
    limits:
      "Tendencia desde {trendMonths} meses; estacionalidad y previsión a partir de {seasonMonths} meses. El intervalo P10–P90 procede del error de predicción del modelo. Limitación: se ignora la autocorrelación de los residuos, así que la incertidumbre real es probablemente mayor.",
  },
  sales: {
    formula: "pedidos = demanda proyectada × cuota de demanda captada × tasa de conversión",
    body:
      "Simulación Monte Carlo de {draws} iteraciones. Ambas tasas son supuestos y se muestran en cada análisis. Sin un volumen absoluto de búsquedas no se estima ninguna venta. La facturación requiere un precio de venta introducido.",
  },
  ads: {
    formula: "CPA = CPC ÷ tasa de conversión; presupuesto de prueba = CPA × conversiones objetivo",
    body:
      "Google: la puja de parte superior de la página P20–P80 de Keyword Planner sirve como aproximación del CPC, probablemente un máximo. Meta y TikTok: estimaciones oficiales solo mediante una cuenta publicitaria; si no, datos insuficientes.",
  },
  score: {
    intro: "{count} criterios, {total} puntos en total. La barra muestra el peso de cada criterio.",
    pointsUnit: "pts",
    rules:
      "Los pesos se renormalizan sobre los criterios disponibles. No hay puntuación por debajo de {coverage} de cobertura, ni sin un criterio de demanda. Tope en {cap} cuando el CPA estimado supera el margen. Los límites de normalización son absolutos: la puntuación de un país no depende de los demás países comparados.",
  },
  criteria: {
    demand_volume: "Volumen de demanda",
    demand_trend: "Tendencia histórica",
    demand_outlook: "Demanda futura (12 meses)",
    seasonality_timing: "Momento estacional",
    competition_current: "Competencia actual",
    competition_trend: "Competencia futura",
    ad_cost: "Coste publicitario",
    market_context: "Contexto de mercado",
    unit_economics: "Economía unitaria",
    search_intent: "Búsquedas relacionadas (Autocomplete)",
    video_interest: "Interés en vídeo (YouTube)",
    market_margin: "Margen al precio de mercado",
  },
  confidence: {
    formula: "confianza = cobertura × actualidad × calidad de las fuentes × coherencia entre fuentes",
    body:
      "Siempre se calcula aparte de la puntuación. Decisión: priorizar por encima de una puntuación de {prioritizeScore} con {prioritizeConfidence} de confianza; probar con cautela a partir de {testScore}; solo exploratorio por debajo de {minConfidence} de confianza, sea cual sea la puntuación.",
  },
  decisions: {
    prioritize: "Priorizar",
    test_carefully: "Probar con cautela",
    avoid: "Evitar",
    exploratory_only: "Solo exploratorio",
    insufficient_data: "Datos insuficientes",
  },
  zones: {
    caption:
      "Horizontal: confianza (%). Vertical: puntuación de oportunidad. Sin una puntuación calculable, la decisión es «{insufficient}».",
  },
  verdict: {
    intro:
      "Cada país recibe un veredicto, regla {rule}. Presenta la decisión anterior sin cambiar la puntuación, los pesos ni los umbrales, y añade factores de bloqueo basados solo en tus datos introducidos y en datos reales. La regla se aplica en el orden de la tabla: la primera fila verdadera da el veredicto.",
    tableCaption: "Regla de veredicto verdict_v1, en el orden en que se aplica",
    columns: { situation: "Situación", verdict: "Veredicto", reason: "Motivo mostrado" },
    rows: {
      blocking: { condition: "Se conoce un factor de bloqueo", reason: "El factor de bloqueo" },
      insufficient: { condition: "Datos insuficientes: sin puntuación", reason: "Las fuentes por conectar" },
      exploratory: {
        condition: "Solo exploratorio: confianza por debajo de {minConfidence}",
        reason: "Confianza demasiado baja, con el factor más débil",
      },
      prioritize: {
        condition: "Priorizar: puntuación de al menos {prioritizeScore}, confianza de al menos {prioritizeConfidence}",
        reason: "Las señales más fuertes",
      },
      avoid: { condition: "Evitar: puntuación por debajo de {testScore}", reason: "Los criterios más débiles" },
      test: {
        condition:
          "Probar con cautela: puntuación de al menos {testScore}, confianza de al menos {minConfidence}, sin llegar a Priorizar",
        reason: "Señales mixtas, con el punto fuerte y el punto débil",
      },
    },
    blockingIntro: "Factores de bloqueo, cada uno calculado solo cuando existen sus datos:",
    blocking: {
      loss: "pérdidas a tu precio de venta, sin IVA, tras aranceles y envío;",
      belowMinimum: "precio previsto por debajo del precio mínimo para tu margen objetivo, cuando se han introducido ambos;",
      noDemand: "ningún dato de demanda nacional para el país: todas las fuentes han fallado.",
    },
    unknownMargin: "Un margen desconocido nunca es un bloqueo: sin precio introducido, el veredicto sigue siendo el de la decisión.",
  },
  ai: {
    intro:
      "La IA local reformula el análisis ya guardado en frases sencillas y propone próximos pasos. No recopila nada ni produce ningún dato: solo lee lo que contiene el análisis.",
    model: "Modelo",
    license: "Licencia",
    runsLocally:
      "El modelo se ejecuta en la tarjeta gráfica de tu propio ordenador, con node-llama-cpp. Ningún dato sale del equipo: ni el producto, ni el análisis, ni la respuesta.",
    checks:
      "Cada número que cita la IA se comprueba con el análisis. Una respuesta que contenga un número ausente del análisis se rechaza y no se muestra. Si el modelo no puede ejecutarse, el motivo se muestra tal cual y no se genera nada en su lugar.",
  },
  assumptions: {
    userRationale: "Valor introducido por el usuario.",
    traffic_capture_share: {
      label: "Cuota de demanda captada",
      description: "Parte de las búsquedas mensuales del país que se convierten en visitas a la tienda (pago + orgánico).",
      rationale: "Supuesto prudente para una tienda nueva sin notoriedad ni SEO. No observado.",
    },
    conversion_rate: {
      label: "Tasa de conversión de visita a pedido",
      description: "Proporción de visitas que terminan en un pedido.",
      rationale: "Rango convencional para comercio electrónico generalista. No observado para este producto.",
    },
    social_ctr: {
      label: "CTR de anuncios en redes sociales",
      description: "Tasa de clics utilizada para convertir un CPM de Meta/TikTok en CPC.",
      rationale: "Rango convencional para campañas de conversión. No observado.",
    },
    test_target_conversions: {
      label: "Conversiones objetivo para una prueba",
      description: "Número de pedidos necesarios para valorar una prueba publicitaria.",
      rationale: "Umbral de decisión fijado por convención, modificable.",
    },
  },
  motionLab: {
    metadataTitle: "Laboratorio de animación",
    title: "Laboratorio de animación (desarrollo)",
    intro:
      "Cada primitiva del kit de movimiento, con controles de demostración. Aquí no hay datos reales: los valores son ficticios y solo sirven para ver el movimiento. Esta página no existe en producción.",
    replay: "Repetir",
    ring: {
      title: "Indicador circular",
      hint: "El arco se dibuja una vez de cero al valor cuando aparece el indicador. Un halo difuso del mismo color, sin sombra. Después, un cambio de valor se desliza hasta el nuevo.",
      demo: "Demo",
      value: "Valor ficticio {value}",
      aria: "Indicador de demostración, valor ficticio {value}",
      selectorAria: "Valor ficticio del indicador",
      swatchAria: "Color {name}, valor ficticio {value}",
      swatches: { mint: "Menta", amber: "Ámbar", coral: "Coral" },
    },
    pending: {
      title: "Botón con espera",
      hint: "La etiqueta deja sitio al anillo sin cambiar el ancho del botón. El segundo sigue su formulario local (useFormStatus): nada sale de la página.",
      analyse: "Analizar",
      analysing: "Análisis en curso",
      validate: "Validar la demo",
      validating: "Validando",
    },
    segmented: {
      title: "Selector segmentado",
      hint: "El cursor se desliza con un efecto muelle. Con el teclado: flechas, Inicio y Fin.",
      zoneAria: "Zona de demostración",
      france: "Francia",
      world: "Todo el mundo",
      periodAria: "Periodo de demostración",
      day: "Día",
      week: "Semana",
      month: "Mes",
    },
    reveal: {
      title: "Aparición escalonada",
      hint: "Los elementos suben y aparecen una sola vez, uno tras otro (60 ms de diferencia).",
      signals: {
        first: "Primera señal ficticia",
        second: "Segunda señal ficticia",
        third: "Tercera señal ficticia",
        fourth: "Cuarta señal ficticia",
      },
    },
    draw: {
      title: "Trazado de curva",
      hint: "Una línea continua se dibuja una vez cuando se hace visible. Curva decorativa, sin datos.",
      aria: "Curva decorativa de demostración",
    },
    number: {
      title: "Número animado",
      hint: "Cuenta una vez hasta su valor cuando aparece, en cifras tabulares. Números ficticios.",
      number: "Número ficticio",
      percent: "Porcentaje ficticio",
    },
    expand: {
      title: "Panel desplegable",
      hint: "La altura sigue al contenido, sin medirlo. El contenido cerrado sigue en la página pero ya no es accesible.",
      show: "Mostrar el detalle",
      hide: "Ocultar el detalle",
      content: "Contenido de demostración. Se abre en altura con un fundido y se cierra de la misma manera.",
      disclosure: "Disclosure, mismo movimiento",
      disclosureBody: "El componente Disclosure ahora usa Expand.",
    },
    viewTransition: {
      title: "Transición de vista",
      hint: "Un cambio de modo pasa por una View Transition cuando el navegador lo permite; si no, es inmediato.",
      aria: "Vista de demostración",
      compact: "Compacta",
      detail: "Detallada",
      card: "Tarjeta de demostración",
      cardDetail: "En el modo detallado, la tarjeta ocupa todo el ancho y muestra este texto adicional.",
    },
    loader: {
      title: "Anillo de carga",
      hint: "Hereda el color del texto. Inmóvil si se solicita movimiento reducido.",
      label: "Carga de demostración",
    },
    scrollReveal: {
      title: "Aparición al desplazarse",
      hint: "Se reproduce una vez cuando la sección entra en pantalla; si ya es visible al cargar, se reproduce enseguida.",
      tiles: { one: "Tarjeta uno", two: "Tarjeta dos", three: "Tarjeta tres" },
    },
  },
};
