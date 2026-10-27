# Installation

Ce guide installe EZ-Shop sur ta machine, avec ou sans l'IA locale.

## 1. Prérequis

| Élément | Requis | Remarque |
|---|---|---|
| Système | Windows, macOS ou Linux | |
| Node.js | 22.12 ou plus récent | Node 24 LTS conseillé. Le champ `engines` du `package.json` accepte encore 20.9, mais Node 20 est en fin de vie. |
| npm | fourni avec Node.js | |
| Git | pour cloner le dépôt | |
| Espace disque | environ 6 Go | surtout pour le modèle d'IA (5,7 Go) ; sans l'IA, quelques centaines de Mo suffisent |
| Carte graphique | facultative | pour l'IA locale, environ 8 Go de VRAM conseillés (le modèle et son contexte en occupent environ 6,5 Go) |

L'IA locale utilise les binaires précompilés de node-llama-cpp : **Vulkan** ou **CUDA** (NVIDIA) sous Windows et
Linux, **Metal** sur les Mac Apple Silicon. Rien n'est compilé sur ta machine. Sans carte graphique compatible,
node-llama-cpp peut se rabattre sur le processeur, mais une lecture devient alors très lente et peut dépasser le
délai prévu (voir [Dépannage](#9-dépannage)).

## 2. Cloner et installer

```bash
git clone https://github.com/Milis0f/EZ-Shop.git
cd EZ-Shop
npm install
```

> Les scripts npm appellent les outils par `node node_modules/...` exprès : les raccourcis `.cmd` de npm sous Windows
> cassent quand le chemin du projet contient `&`. Tu peux donc installer le projet dans n'importe quel dossier.

## 3. Configurer `.env.local`

Copie le modèle :

```bash
cp .env.example .env.local
```

Sous PowerShell : `Copy-Item .env.example .env.local`.

`.env.local` est ignoré par Git : ne le commite jamais et ne partage jamais son contenu. Toutes les variables sont
facultatives. Une source laissée vide reste « non branchée » et ses indicateurs affichent `DATA_INSUFFICIENT`.

En développement, tu peux aussi remplir les clés depuis l'application : **Sources de données → Configurer**. Le
formulaire écrit les variables dans `.env.local` et les applique sans redémarrage. Il ne fonctionne qu'en
développement et pour des requêtes adressées à `localhost` ; sinon il affiche les lignes à ajouter à la main. Le
pas-à-pas de chaque source est dans le [tutoriel](TUTORIAL.md#brancher-des-sources).

### Base de données

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne de connexion Postgres ou Supabase. Vide : base PGlite embarquée. |
| `PGLITE_DATA_DIR` | Dossier de la base PGlite. Par défaut `.data/pglite`. |

### Réseau

| Variable | Rôle |
|---|---|
| `PROVIDER_HTTP_TIMEOUT_MS` | Délai maximal d'un appel à une source, en millisecondes (1 000 à 60 000, 12 000 par défaut). |

### IA locale

| Variable | Rôle |
|---|---|
| `LOCAL_AI_ENABLED` | `true` par défaut. `false` désactive l'IA ; la page d'analyse l'indique. |
| `LOCAL_AI_MODEL_PATH` | Chemin du fichier GGUF, relatif à la racine du projet ou absolu. Vide : `.data/models/Qwen3.5-9B-Q4_K_M.gguf`. |

### Sources à clé

| Variables | Source |
|---|---|
| `GOOGLE_TRENDS_API_KEY` | Google Trends API (alpha, sur candidature ; connecteur pas encore codé pour ce format) |
| `GOOGLE_ADS_API_VERSION`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads API, Keyword Planner. Le dernier n'est utile que si l'accès passe par un compte administrateur (MCC). |
| `META_GRAPH_API_VERSION`, `META_AD_LIBRARY_ACCESS_TOKEN` | Meta Ad Library (bibliothèque publicitaire) |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | TikTok Commercial Content API (accès recherche) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | eBay Browse API (App ID et Cert ID du jeu de clés Production) |
| `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET`, `ALIEXPRESS_TRACKING_ID` | AliExpress Affiliate API |
| `WIKIMEDIA_CONTACT` | Un e-mail ou une adresse web de contact, envoyé à Wikimedia dans l'en-tête User-Agent. Sans lui, Wikimedia limite à 10 requêtes par minute ; avec, 200. Recommandé pour les analyses « Monde entier ». Absent de `.env.example`, à ajouter à la main ou depuis **Sources de données**. |

Les lignes commentées `META_MARKETING_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `TIKTOK_BUSINESS_ACCESS_TOKEN` et
`TIKTOK_ADVERTISER_ID` correspondent à des connecteurs pas encore codés.

Les sources ouvertes (Banque mondiale, Eurostat, OCDE, Google Autocomplete, Wikipédia et Wikidata, GOV.UK Trade
Tariff, USITC HTS, taux de TVA, taux de change BCE, traduction MyMemory) n'ont besoin d'aucune variable.

## 4. Télécharger le modèle de l'IA locale

Étape facultative : sans le modèle, tout fonctionne sauf la lecture par l'IA.

| | |
|---|---|
| Dépôt Hugging Face | [`unsloth/Qwen3.5-9B-GGUF`](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) |
| Fichier | `Qwen3.5-9B-Q4_K_M.gguf` (environ 5,7 Go) |
| Licence | Apache-2.0 |
| SHA-256 | `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` |
| Emplacement attendu | `.data/models/Qwen3.5-9B-Q4_K_M.gguf`, ou le chemin donné par `LOCAL_AI_MODEL_PATH` |

Avec la CLI Hugging Face (`pip install -U huggingface_hub`) :

```bash
hf download unsloth/Qwen3.5-9B-GGUF Qwen3.5-9B-Q4_K_M.gguf --local-dir .data/models
```

Sur une version plus ancienne de la CLI, la commande s'appelle `huggingface-cli download` avec les mêmes arguments.

Avec curl :

```bash
mkdir -p .data/models
curl -L -o .data/models/Qwen3.5-9B-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf
```

Vérifie ensuite l'empreinte du fichier :

```bash
# Linux
sha256sum .data/models/Qwen3.5-9B-Q4_K_M.gguf
# macOS
shasum -a 256 .data/models/Qwen3.5-9B-Q4_K_M.gguf
```

```powershell
# Windows (PowerShell)
Get-FileHash .data\models\Qwen3.5-9B-Q4_K_M.gguf -Algorithm SHA256
```

Le résultat doit être exactement l'empreinte du tableau. Sinon, supprime le fichier et télécharge-le à nouveau.

Pour voir ce que node-llama-cpp détecte sur ta machine (carte graphique, VRAM, binaire utilisé) :

```bash
node node_modules/node-llama-cpp/dist/cli/cli.js inspect gpu
```

Le modèle se charge à la première lecture demandée, pas au démarrage du serveur. Le premier appel prend donc plus
longtemps (chargement en VRAM puis mise en route) ; les suivants prennent de 8 à 25 secondes selon le nombre de
pays, puis la lecture est servie depuis le cache.

### Désactiver l'IA

Dans `.env.local` :

```bash
LOCAL_AI_ENABLED=false
```

La page d'analyse affiche alors « IA locale indisponible. IA locale désactivée (LOCAL_AI_ENABLED=false). » et rien
n'est généré à sa place. Changer de modèle ou de chemin demande un redémarrage du serveur : le modèle déjà chargé
reste en mémoire.

## 5. Base de données

Par défaut, EZ-Shop utilise **PGlite**, un Postgres compilé en WASM, stocké dans le dossier `PGLITE_DATA_DIR`
(`.data/pglite`). Il est créé et migré automatiquement au premier lancement : rien à installer.

Pour utiliser Postgres ou Supabase, renseigne `DATABASE_URL` (chez Supabase, la chaîne de connexion « pooled »),
puis applique les migrations :

```bash
npm run db:migrate
```

Le schéma et les migrations (`drizzle/`) sont les mêmes pour les deux bases. Pour repartir de zéro en local, arrête
le serveur et supprime le dossier `.data/pglite` : tes analyses enregistrées seront perdues.

## 6. Lancer l'application

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (Turbopack) sur http://localhost:3000 |
| `npm run build` | Build de production |
| `npm start` | Serveur de production, après `npm run build` |

Le formulaire **Sources de données → Configurer** est désactivé en production (`npm start`) : renseigne alors
`.env.local` à la main.

## 7. Tests et vérifications

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires et d'intégration (Vitest) |
| `npm run test:watch` | Tests en mode surveillance |
| `npm run test:coverage` | Tests avec couverture |
| `npm run typecheck` | Vérification TypeScript |
| `npm run lint` | ESLint |
| `npm run check` | Les trois à la suite : typecheck, lint, tests |

Les tests n'ont besoin ni de clé ni du modèle d'IA : les appels HTTP des sources et node-llama-cpp y sont remplacés
par des doublures, et les données synthétiques vivent uniquement dans `src/test/`.

## 8. Outils de base de données

| Commande | Rôle |
|---|---|
| `npm run db:generate` | Génère une migration SQL à partir de `src/server/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations (Postgres si `DATABASE_URL` est défini, PGlite sinon) |
| `npm run db:studio` | Ouvre Drizzle Studio |

## 9. Dépannage

**Le port 3000 est déjà utilisé.** Next.js propose un autre port, ou choisis-le toi-même :

```bash
npm run dev -- -p 3001
```

**« IA locale indisponible. Modèle introuvable (Qwen3.5-9B-Q4_K_M.gguf)… »** Le fichier n'est pas à l'endroit
attendu. Vérifie le dossier `.data/models/` ou la valeur de `LOCAL_AI_MODEL_PATH`, puis recharge la page.

**« Le moteur d'IA locale n'a pas pu démarrer (…). Nouvel essai possible dans une minute. »** node-llama-cpp n'a
pas pu charger le modèle : pilote graphique absent ou trop ancien, pas assez de VRAM, ou fichier corrompu (vérifie
le SHA-256). Lance `node node_modules/node-llama-cpp/dist/cli/cli.js inspect gpu` pour voir ce qui est détecté,
mets à jour les pilotes Vulkan ou CUDA, ferme les applications qui occupent la VRAM. L'application réessaie au bout
d'une minute.

**« L'IA locale n'a pas répondu dans le délai prévu. Génération arrêtée. »** La génération a dépassé son délai (au
moins 120 secondes). C'est typique d'un calcul sur le processeur faute de carte graphique utilisable. Si ta machine
n'a pas de GPU compatible, désactive l'IA avec `LOCAL_AI_ENABLED=false`.

**Trop de demandes de lecture.** Les lectures par l'IA sont limitées (20 générations par tranche de 10 minutes) pour
ne pas saturer la carte graphique. Les lectures déjà en cache ne comptent pas. Attends quelques minutes.

**« Analyse fictive ancienne… »** Cette bannière apparaît sur des analyses enregistrées avant la V1 avec des données
synthétiques. Leurs chiffres ne sont pas réels ; elles restent lisibles mais ne sont jamais recréées.

**Une analyse « Monde entier » manque des pays côté Wikipédia.** Wikimedia limite les requêtes sans contact.
Renseigne `WIKIMEDIA_CONTACT` (voir plus haut).

**`npm audit` signale des avertissements.** Ceux connus concernent des outils de développement ou la CLI shadcn,
pas le code exécuté par l'application. Plusieurs dépendances indirectes sont déjà épinglées sur une version corrigée
dans la section `overrides` du `package.json`.
