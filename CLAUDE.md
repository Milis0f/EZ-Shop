# Projet

Cette application est une web app de recherche produit pre-launch pour e-commerce et dropshipping.

## Objectif

À partir d’un nom de produit, l’application estime le potentiel commercial du produit avant tout lancement, pays par pays.

## Règles métier

- L’application est strictement pre-launch.
- Elle ne doit jamais dépendre de ventes réelles du propriétaire du projet.
- Elle ne doit jamais utiliser Shopify orders, Meta Pixel, Google Analytics, ni historique publicitaire personnel.
- Elle doit utiliser uniquement des données externes historiques, observées ou prévisionnelles.
- L’analyse doit se faire uniquement au niveau pays.
- Ne jamais produire d’analyse par région, département, ville ou code postal.
- Si une donnée manque ou n’est pas suffisamment fiable, afficher `DATA_INSUFFICIENT`.
- Ne jamais inventer de chiffres.
- Toujours séparer :
  - données observées,
  - hypothèses,
  - calculs dérivés,
  - estimations finales,
  - score de confiance.

## Sorties attendues

Pour chaque pays, produire si possible :
- demande historique,
- tendance,
- saisonnalité,
- mois de pic,
- estimation de demande future,
- estimation ventes potentielles P10 / P50 / P90,
- estimation chiffre d’affaires potentiel,
- estimation CPC / CPA / budget test,
- niveau de concurrence actuelle,
- estimation de concurrence future,
- score d’opportunité sur 100,
- score de confiance indépendant.

## Qualité des estimations

- Toute estimation doit être traçable.
- Toute estimation doit mentionner ses hypothèses.
- Ne jamais présenter une estimation comme un fait certain.
- Les graphiques doivent distinguer réel observé et projection.
- Les valeurs mock doivent être séparées clairement des données réelles.

## Architecture

Préférer :
- Next.js
- TypeScript strict
- Tailwind
- shadcn/ui
- composants réutilisables
- architecture modulaire par domaine
- adapters pour chaque source de données
- schémas de validation stricts
- séparation frontend / moteur d’analyse / data providers

## Data providers à prévoir

Prévoir des intégrations adaptables pour :
- Google Trends
- Google Ads Keyword Planner
- Meta Ad Library
- TikTok Commercial Content / ads data
- World Bank
- Eurostat
- OECD
- pays / devises / langues

## UX / UI

- Dashboard premium, sobre, moderne, sombre
- Lisibilité maximale
- Graphiques propres
- Comparaison pays par pays
- Interface orientée prise de décision
- Pas de design gadget
- Pas d’informations trompeuses
- Afficher clairement la confiance et les limites

## Développement

- Commencer par un plan détaillé avant génération massive de code.
- Procéder par étapes.
- Créer d’abord la structure, puis les composants, puis les adapters, puis le moteur de scoring.
- Toujours privilégier du code lisible, typé et maintenable.
- Ajouter des TODO explicites quand une API officielle nécessite une clé, OAuth ou une approbation.
- Ne jamais simuler une intégration réelle en prétendant qu’elle fonctionne si elle n’est pas branchée.