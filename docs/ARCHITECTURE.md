# Architecture

Vue d'ensemble du code d'EZ-Shop. Les formules détaillées sont sur la page **Méthode** de l'application
(`src/app/methodology/page.tsx`).

## Principes

1. **Avant lancement uniquement** : seules des données externes entrent dans l'analyse, jamais les ventes, campagnes
   ou statistiques du propriétaire.
2. **Niveau pays uniquement** : chaque champ géographique est un code ISO 3166-1 alpha-2 (contraintes `CHECK` en
   base).
3. **Aucun nombre inventé** : une valeur est soit connue avec ses sources, soit `DATA_INSUFFICIENT` avec une raison.
4. **Le mesuré et le supposé restent séparés**, et le score et la confiance ne sont jamais fusionnés.

## Dossiers

| Dossier | Contenu |
|---|---|
| `src/domain/` | Types et schémas Zod : `Datum`, provenance, pays, analyse, lecture de l'IA, lecture des liens fournisseurs (`supplier-url.ts`). |
| `src/engine/` | Fonctions pures et testées : termes et traductions, modèle de demande, concurrence, coûts publicitaires, ventes, taxes, score, confiance, verdict et journal des sources (`report/`). |
| `src/providers/` | Un adaptateur par source derrière des contrats de capacité (`contracts.ts`), et le registre (`registry.ts`), seul endroit qui connaît les classes concrètes. |
| `src/server/` | Base de données (Drizzle, PGlite ou Postgres), dépôts, pipeline d'analyse, IA locale (`ai/`), limites de débit, garde des requêtes. |
| `src/components/` | Interface : `ui/` (shadcn), `layout/`, `data/` (affichage des `Datum`), `analysis/`, `country/`, `search/`, `ai/`, `connectors/`, `motion/`. |
| `src/app/` | Pages Next.js (recherche, analyse, page pays, sources, méthode), routes d'API et server actions. |
| `src/config/` | Environnement validé (`env.ts`), modèle de score (`scoring.ts`), hypothèses par défaut, guides des connecteurs. |
| `src/test/` | Doublures des sources et fixtures. Une règle ESLint interdit au code produit de les importer. |
| `drizzle/` | Migrations SQL. |

Règle de dépendance : `engine/` et `domain/` n'importent jamais `server/`, `app/` ni un SDK tiers.

## Flux d'une analyse

```
formulaire ─► server action / POST /api/analyses
                 │
                 ▼
server/pipeline/run-analysis.ts
  1. valider l'entrée (Zod)                       domain/schemas.ts
  2. préparer les termes, traduire par pays        engine/terms, pipeline/translate.ts
  3. collecter : sources globales puis par pays    pipeline/collect*.ts ─► providers/*
  4. analyser chaque pays (pur, déterministe)      engine/analyze-country.ts
  5. enregistrer analyse + tables d'audit          server/repositories
                 │
                 ▼
pages /analyses/[id] et /analyses/[id]/[country] ─► verdict, journal, IA locale
```

Chaque échec d'une source devient un `DATA_INSUFFICIENT` et un incident de collecte, visibles dans le journal des
sources. Les tables d'audit gardent les observations brutes, les hypothèses, les prévisions, les composantes du score
et les instantanés de concurrence.

## Modèle de provenance

```ts
type Datum<T> = Known<T> | Insufficient;

interface Known<T> {
  status: "known";
  kind: "observed" | "derived" | "estimate" | "assumption";
  value: T;
  unit: Unit;
  sources: SourceRef[];      // source, origine (live | user | config | mock ancien), période, requête
  method?: string;
  assumptionKeys?: string[];
}

interface Insufficient { status: "DATA_INSUFFICIENT"; reason: string; missing: string[] }
```

- **observed** : mesuré par une source externe, non transformé.
- **assumption** : paramètre choisi (taux de conversion, part de demande captée), affiché dans chaque analyse.
- **derived** : calcul déterministe à partir d'autres valeurs.
- **estimate** : projection d'un modèle, avec son incertitude (P10 / P50 / P90).

Les valeurs saisies par l'utilisateur ont l'origine `user` et s'affichent « saisi par toi ». `derived()` et
`estimate()` fusionnent les sources et hypothèses de leurs entrées : la provenance remonte jusqu'au score.

## Score et verdict

Le score d'opportunité (sur 100, `config/scoring.ts`, versionné) combine 12 critères : volume de demande (15),
tendance historique (10), demande future (5), timing saisonnier (5), recherches associées (8), intérêt vidéo (5),
concurrence actuelle (12), concurrence future (3), coût publicitaire (7), contexte de marché (8), économie unitaire
(10), marge au prix du marché (12). Les poids sont renormalisés sur les critères disponibles ; pas de score sous 50 %
de couverture ni sans critère de demande ; plafond à 35 quand le CPA estimé dépasse la marge. Les bornes de
normalisation sont absolues.

La confiance est calculée à part : couverture × fraîcheur × qualité des sources × cohérence entre sources.

La décision en découle (prioriser, tester prudemment, éviter, exploratoire, données insuffisantes), puis la règle
`verdict_v1` (`engine/report/verdict.ts`) la présente en OUI / NON / À SURVEILLER, dans cet ordre :

| Condition | Verdict |
|---|---|
| Facteur bloquant connu (perte à ton prix, prix sous ton prix minimum, aucune donnée de demande nationale) | NON |
| Aucun score | À SURVEILLER |
| Confiance < 40 % | À SURVEILLER |
| Score ≥ 65 et confiance ≥ 60 % | OUI |
| Score < 50 | NON |
| Sinon (score ≥ 50) | À SURVEILLER |

Une marge inconnue n'est jamais bloquante.

## Recherche web et concurrents

`src/server/web/`, appelé par `POST /api/web/research` et `POST /api/web/competitor`, jamais par le pipeline d'analyse :
ces résultats n'entrent ni dans le score ni dans le verdict.

- `safe-fetch.ts` : lecture de pages publiques (http(s), ports standards, adresses privées refusées, redirections
  revérifiées, taille limitée, `robots.txt` respecté).
- `searxng.ts` : recherche par le SearXNG local, démarré à la demande (`scripts/searxng.mjs`).
- `html-extract.ts`, `competitor.ts` : faits publiés par la page ; Shopify par `/products/<handle>.js`.
- `ai-reading.ts` : résumé par l'IA locale. Les pages sont des données non fiables : pas d'outil, grammaire JSON, et
  chaque nombre doit figurer dans le texte lu.

`src/server/ai/installer.ts` (`/api/ai/install`) télécharge le modèle : reprise, place disque, SHA-256.

## Pipeline de l'IA locale

`src/server/ai/`, appelé par `POST /api/analyses/:id/ai` :

1. **Fiche de faits** (`fact-sheet.ts`) : l'analyse enregistrée est réécrite en français, avec la nature et la
   source de chaque valeur et les `DATA_INSUFFICIENT` groupés par raison. Les secrets et les adresses web en sont
   retirés. Pour les analyses longues, une version brève, puis une version qui regroupe les pays aux faits
   identiques.
2. **Génération contrainte** (`engine.ts`) : node-llama-cpp charge Qwen3.5-9B (Q4_K_M) une fois par processus, avec
   des binaires précompilés uniquement (`build: "never"`). La réponse est forcée dans un schéma JSON par une
   grammaire (`createGrammarForJsonSchema`), à température 0,2, une génération à la fois, avec un délai maximal.
3. **Garde-fou des nombres** (`number-guard.ts`) : chaque nombre de la réponse doit exister parmi les valeurs de la
   fiche, avec le même analyseur des deux côtés. Sinon la lecture est rejetée et n'est pas affichée.
4. **Cache** (`insight.ts`) : une lecture réussie est gardée en mémoire par analyse, date de fin et
   `PROMPT_VERSION`. Les échecs ne sont jamais mis en cache. Deux limites de débit séparent les requêtes et les
   générations réelles.

Le texte arrive dans l'interface (`components/ai/`, `components/analysis/ai-insight.tsx`), toujours dans l'aura
avec le badge « IA locale ».

## Tests

Vitest (`npm test`), fichiers `src/**/*.test.ts`, environnement Node. Les sources sont testées sur des réponses
enregistrées avec un `fetch` simulé ; le pipeline reçoit des sources de test par son paramètre `providers` ;
node-llama-cpp est simulé dans les tests de l'IA. Couverture (`npm run test:coverage`) sur `engine`, `providers`,
`domain`, `server/pipeline` et `server/repositories`. `npm run check` enchaîne typecheck, lint et tests.

## Étendre

- **Nouveau critère** : l'implémenter dans `engine/scoring/criteria.ts`, ajouter son poids dans `config/scoring.ts`
  (la somme doit faire 100, un test le vérifie) et changer `SCORING_MODEL_VERSION`.
- **Nouvelle source** : choisir ou ajouter un contrat dans `providers/contracts.ts`, créer
  `providers/<source>/adapter.ts` avec son analyseur testé sur une réponse enregistrée, l'enregistrer dans
  `providers/registry.ts`, ajouter son guide dans `config/connector-guides.ts`. Ne la marquer vérifiée qu'après un
  essai sur la vraie API.
