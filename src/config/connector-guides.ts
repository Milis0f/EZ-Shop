import type { ProviderId } from "@/domain/provenance";

/**
 * What each connector brings and how to switch it on, step by step, in the user's words.
 * Links point to the official pages (checked 2026-10-15). Menu names on third-party consoles can change:
 * steps describe the goal first, the click path second.
 */

export type ConnectorGroup = "ready" | "free_account" | "application" | "planned";

export interface GuideStep {
  readonly title: string;
  readonly body: string;
  readonly link?: { readonly label: string; readonly url: string };
  /** Variables typed at this step. */
  readonly fields?: readonly string[];
}

export interface ConnectorGuide {
  readonly group: ConnectorGroup;
  /** One sentence: what the analysis gains with this source. */
  readonly brings: string;
  readonly cost: string;
  /** Rough setup time, once accounts exist. */
  readonly setupTime?: string;
  readonly steps: readonly GuideStep[];
}

export const CONNECTOR_GROUPS: ReadonlyArray<{ readonly id: ConnectorGroup; readonly title: string; readonly intro: string }> = [
  { id: "ready", title: "Actives sans configuration", intro: "Interrogées à chaque analyse, sans compte ni clé." },
  { id: "free_account", title: "Gratuites, à brancher", intro: "Un compte gratuit et quelques minutes : suis le guide de chaque source." },
  { id: "application", title: "Sur candidature", intro: "La plateforme accorde l'accès après examen ; le connecteur marche dès qu'il est accordé." },
  { id: "planned", title: "À venir", intro: "Connecteurs pas encore codés : les clés peuvent déjà être préparées." },
];

const READY = (brings: string): ConnectorGuide => ({ group: "ready", brings, cost: "Gratuit", steps: [] });

export const CONNECTOR_GUIDES: Readonly<Record<ProviderId, ConnectorGuide>> = {
  "world-bank": READY("Population, PIB par habitant et part d'internautes de chaque pays."),
  eurostat: READY("Part des habitants qui achètent en ligne, pays européens."),
  oecd: READY("Confiance des consommateurs, pays de l'OCDE."),
  "google-autocomplete": READY("Ce que les gens tapent après le nom du produit dans chaque pays : achat, avis, marques, marketplaces."),
  wikimedia: {
    group: "ready",
    brings: "Audience Wikipédia de la catégorie du produit : tendance et saisonnalité quand Google n'en donne pas.",
    cost: "Gratuit",
    steps: [
      {
        title: "Ajouter un contact (recommandé)",
        body: "Sans contact, Wikimedia limite les requêtes à 10 par minute : une analyse « Monde entier » peut alors manquer des pays. Avec un email ou une adresse web, la limite passe à 200 par minute.",
        link: { label: "Règles de Wikimedia", url: "https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits" },
        fields: ["WIKIMEDIA_CONTACT"],
      },
    ],
  },
  "uk-trade-tariff": READY("Code douanier du produit et droits d'import au Royaume-Uni et dans l'UE selon le pays d'origine."),
  "usitc-hts": READY("Droits d'import aux États-Unis pour le code douanier du produit."),
  "vat-rates": READY("Taux de TVA de chaque pays, pour comparer les prix affichés TTC."),
  "ecb-fx": READY("Taux de change officiels pour convertir les prix étrangers en euros."),
  mymemory: READY("Traduit le nom du produit dans la langue de chaque pays, pour analyser le monde entier à partir d'un seul nom."),

  "youtube-data": {
    group: "free_account",
    brings: "Vidéos publiées sur le produit dans chaque pays et vues médianes : intérêt réel et contenus concurrents.",
    cost: "Gratuit (10 000 unités par jour)",
    setupTime: "5 min",
    steps: [
      {
        title: "Activer la YouTube Data API v3",
        body: "Ouvre la page, choisis ou crée un projet Google Cloud, puis clique sur « Activer ».",
        link: { label: "Bibliothèque d'API Google Cloud", url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
      },
      {
        title: "Créer une clé API",
        body: "Identifiants > Créer des identifiants > Clé API. Une clé AIza… existante du même projet convient. Conseillé : restreins-la à la YouTube Data API v3.",
        link: { label: "Identifiants du projet", url: "https://console.cloud.google.com/apis/credentials" },
      },
      { title: "Coller la clé", body: "Elle est écrite dans .env.local sur ta machine, jamais renvoyée au navigateur.", fields: ["YOUTUBE_API_KEY"] },
    ],
  },

  "ebay-browse": {
    group: "free_account",
    brings: "Annonces et prix réels du produit sur le site eBay de chaque pays, et part des vendeurs basés en Chine.",
    cost: "Gratuit",
    setupTime: "10 min",
    steps: [
      {
        title: "Créer un compte développeur eBay",
        body: "Inscription gratuite au programme développeurs, avec ton compte eBay ou un nouveau.",
        link: { label: "eBay Developers Program", url: "https://developer.ebay.com/" },
      },
      {
        title: "Générer un jeu de clés Production",
        body: "Application Keys : nomme ton application puis crée le jeu de clés Production (pas Sandbox).",
        link: { label: "Application Keys", url: "https://developer.ebay.com/my/keys" },
      },
      {
        title: "Activer le jeu de clés",
        body: "eBay bloque les clés Production tant que la question des notifications de suppression de compte n'est pas réglée. Cette app ne stocke aucune donnée d'utilisateur eBay : demande l'exemption.",
        link: { label: "Marketplace Account Deletion", url: "https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion" },
      },
      { title: "Coller App ID et Cert ID", body: "Les deux viennent du même jeu de clés Production.", fields: ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"] },
    ],
  },

  "aliexpress-affiliate": {
    group: "free_account",
    brings: "Prix d'achat réels, ventes récentes et notes des produits AliExpress : ton coût de sourcing sans saisie.",
    cost: "Gratuit",
    setupTime: "15 min + validation (1 à 3 jours ouvrés en général)",
    steps: [
      {
        title: "Rejoindre le programme affilié AliExpress",
        body: "Inscription gratuite à AliExpress Portals. Dans ton espace affilié, crée ou récupère un Tracking ID.",
        link: { label: "AliExpress Portals", url: "https://portals.aliexpress.com/" },
      },
      {
        title: "Créer une application sur l'Open Platform",
        body: "Connecte-toi avec le même compte, ouvre la console des applications et crée une application de type affilié. AliExpress la valide en général sous 1 à 3 jours ouvrés.",
        link: { label: "AliExpress Open Platform", url: "https://openservice.aliexpress.com/" },
      },
      {
        title: "Coller les identifiants de l'application",
        body: "App Key et App Secret sont affichés dans la console une fois l'application validée.",
        fields: ["ALIEXPRESS_APP_KEY", "ALIEXPRESS_APP_SECRET", "ALIEXPRESS_TRACKING_ID"],
      },
    ],
  },

  "google-ads-keyword-planner": {
    group: "application",
    brings: "Volumes de recherche mensuels réels, concurrence et CPC Google : les seules données qui permettent d'estimer des ventes.",
    cost: "Gratuit, accès Basic requis",
    setupTime: "20 min + validation de l'accès Basic",
    steps: [
      {
        title: "Activer l'API Google Ads",
        body: "Dans un projet Google Cloud, active l'API Google Ads. Le niveau d'accès du projet (Test, Explorer, Basic) s'affiche sur sa page Google Ads API.",
        link: { label: "API Google Ads", url: "https://console.cloud.google.com/apis/library/googleads.googleapis.com" },
      },
      {
        title: "Demander l'accès Basic",
        body: "Keyword Planner exige Basic ; Explorer ne suffit pas. Il se demande après la vérification de la marque. Tant qu'il n'est pas accordé, renseigne quand même les champs : rien à changer ensuite.",
        link: { label: "Page Google Ads API du projet", url: "https://console.cloud.google.com/google/ads-apis/overview" },
      },
      {
        title: "Créer un ID client OAuth",
        body: "Identifiants > ID client OAuth > Application Web, avec https://developers.google.com/oauthplayground comme URI de redirection autorisée.",
        link: { label: "Identifiants du projet", url: "https://console.cloud.google.com/apis/credentials" },
        fields: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"],
      },
      {
        title: "Générer le jeton d'actualisation",
        body: "Engrenage > coche « Use your own OAuth credentials » et colle ton ID et secret. Scope https://www.googleapis.com/auth/adwords, Authorize APIs, puis « Exchange authorization code for tokens ». Copie le Refresh token (1//…).",
        link: { label: "OAuth Playground", url: "https://developers.google.com/oauthplayground" },
        fields: ["GOOGLE_ADS_REFRESH_TOKEN"],
      },
      {
        title: "Compte et version",
        body: "L'ID du compte Google Ads s'affiche en haut de l'interface Google Ads. La version est la plus récente des notes de version.",
        fields: ["GOOGLE_ADS_CUSTOMER_ID", "GOOGLE_ADS_LOGIN_CUSTOMER_ID", "GOOGLE_ADS_API_VERSION"],
      },
    ],
  },

  "google-trends": {
    group: "application",
    brings: "Forme exacte de la demande de recherche (tendance, saisonnalité) dans chaque pays.",
    cost: "Gratuit, sur candidature",
    steps: [
      {
        title: "Candidater à l'API alpha",
        body: "Google ouvre l'API Trends sur candidature. Le connecteur n'est pas encore codé pour le format de réponse alpha.",
        link: { label: "API Google Trends", url: "https://developers.google.com/search/apis/trends" },
      },
      { title: "Coller la clé reçue", body: "Une fois accepté.", fields: ["GOOGLE_TRENDS_API_KEY"] },
    ],
  },

  "meta-ad-library": {
    group: "application",
    brings: "Publicités actives et annonceurs du produit sur Facebook et Instagram (UE) : la concurrence visible.",
    cost: "Gratuit, identité confirmée requise",
    steps: [
      {
        title: "Confirmer ton identité auprès de Meta",
        body: "Obligatoire pour l'API de la Bibliothèque publicitaire.",
        link: { label: "Confirmation d'identité", url: "https://www.facebook.com/ID" },
      },
      {
        title: "Créer une application Meta for Developers",
        body: "Puis génère un jeton d'accès utilisateur dans l'explorateur de l'API Graph.",
        link: { label: "Meta for Developers", url: "https://developers.facebook.com/apps/" },
      },
      { title: "Coller la version et le jeton", body: "Version du Graph API au format vNN.0.", fields: ["META_GRAPH_API_VERSION", "META_AD_LIBRARY_ACCESS_TOKEN"] },
    ],
  },

  "tiktok-commercial-content": {
    group: "application",
    brings: "Publicités diffusées sur TikTok dans l'UE pour le produit : annonces et annonceurs.",
    cost: "Gratuit, accès recherche sur candidature",
    steps: [
      {
        title: "Candidater à la Commercial Content API",
        body: "Accès réservé après examen de la demande par TikTok.",
        link: { label: "Commercial Content API", url: "https://developers.tiktok.com/products/commercial-content-api" },
      },
      { title: "Coller les identifiants de l'application", body: "Client key et client secret de l'application approuvée.", fields: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"] },
    ],
  },

  "meta-marketing-api": {
    group: "planned",
    brings: "Coût publicitaire estimé par Meta pour le ciblage du produit.",
    cost: "Gratuit, compte publicitaire requis",
    steps: [{ title: "Préparer les identifiants", body: "Le connecteur n'est pas encore codé : les valeurs seront utilisées dès qu'il le sera.", fields: ["META_MARKETING_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"] }],
  },
  "tiktok-business-api": {
    group: "planned",
    brings: "Portée et coût estimés par TikTok pour le ciblage du produit.",
    cost: "Gratuit, compte annonceur requis",
    steps: [{ title: "Préparer les identifiants", body: "Le connecteur n'est pas encore codé : les valeurs seront utilisées dès qu'il le sera.", fields: ["TIKTOK_BUSINESS_ACCESS_TOKEN", "TIKTOK_ADVERTISER_ID"] }],
  },
};
