# Tutoriel

Ce tutoriel suppose qu'EZ-Shop tourne déjà sur http://localhost:3000 (voir [INSTALL.md](INSTALL.md)).

## Ta première analyse

### 1. Décrire le produit

Sur l'accueil, la grande capsule accepte deux choses :

- **un nom de produit**, par exemple « casquette » ;
- **le lien de la fiche fournisseur** : Temu, AliExpress, Alibaba.com ou 1688.


Quand tu colles un lien, EZ-Shop le lit **sans rien télécharger** : il reconnaît la plateforme et l'identifiant de
l'article (par exemple « AliExpress, article 1005006… ») et te propose un nom par défaut. Tu peux taper un nom plus
parlant juste en dessous ; c'est ce nom qui sert aux recherches.

Formes reconnues :

| Plateforme | Exemple de chemin |
|---|---|
| AliExpress | `/item/1005006789012345.html` |
| Temu | paramètre `goods_id=…` ou chemin finissant par `-g-601099….html` |
| Alibaba.com | chemin finissant par `_1600….html` |
| 1688 | `/offer/6543….html` |

**Les liens courts sont refusés** (`s.click.aliexpress.com`, `a.aliexpress.com`, `share.temu.com`, `temu.to`).
Pour connaître la fiche derrière un lien court, il faudrait le suivre, donc interroger le site du fournisseur, et
ces sites interdisent la collecte automatique. EZ-Shop affiche alors : « Lien court : ouvre-le et colle l'adresse
finale de la fiche produit. » Ouvre le lien dans ton navigateur et copie l'adresse de la page qui s'affiche.

### 2. Choisir où chercher

- **France** : une analyse du marché français, en quelques secondes.
- **Monde entier** : 18 pays (Europe, Royaume-Uni, États-Unis, Canada, Australie), environ 15 secondes. Le nom du
  produit est traduit automatiquement dans la langue de chaque pays ; les traductions utilisées sont affichées en
  haut du rapport.

En mode avancé, tu peux choisir les pays un par un et fournir tes propres traductions ou synonymes.

### 3. Remplir « Prix et livraison » (facultatif)

Le bouton **Prix et livraison** ouvre un tiroir. Tout y est facultatif, et tout ce que tu saisis est marqué
« saisi par toi » dans le rapport, à côté des données observées.

| Champ | Ce qu'il change |
|---|---|
| Prix fournisseur (€) | Entre dans le coût de revient par unité. |
| Frais de livraison (€) | Par unité, jusqu'au client ; entre aussi dans le coût de revient. |
| Prix de vente envisagé (€) | Permet de calculer la marge « à ton prix ». Une perte à ce prix rend le verdict NON. |
| Marge visée (%) | Entre 1 et 95 %. Donne le prix minimum pour atteindre cette marge. Si ton prix envisagé est en dessous, le verdict devient NON. |
| Catégorie | Telle que tu la nommes ; EZ-Shop ne la devine jamais. |
| Pays d'origine | D'où part le colis : fixe les droits de douane de chaque pays de destination. |
| Code douanier SH | 4 à 10 chiffres. Sans code, il est cherché dans le tarif douanier. |

Sans prix de vente ni marge visée, la marge reste `DATA_INSUFFICIENT` : EZ-Shop ne fabrique pas de prix de marché.

Clique sur **Analyser**.

## Lire le rapport


### Le verdict et l'anneau de confiance

Le grand disque donne le verdict : **OUI**, **NON** ou **À SURVEILLER**. L'anneau qui l'entoure se remplit jusqu'à
la **confiance**, affichée en pourcentage sous le verdict. La confiance mesure la qualité des données (couverture,
fraîcheur, qualité des sources, cohérence entre elles), pas l'intérêt du produit.

En résumé, la règle `verdict_v1` donne :

- **NON** si un facteur bloquant est connu (perte à ton prix, prix sous ton prix minimum, aucune donnée de demande
  pour le pays), ou si le score est faible avec une confiance suffisante ;
- **OUI** seulement si le score atteint 65 sur 100 avec au moins 60 % de confiance ;
- **À SURVEILLER** dans tous les autres cas : signaux mitigés, confiance trop faible ou données insuffisantes.

Sans sources à clé, la confiance reste basse et le verdict est presque toujours « À SURVEILLER ». C'est normal : un
OUI demande des volumes de recherche réels. Le tableau complet est sur la page **Méthode**.

Avec « Monde entier », le disque montre le verdict d'un pays (indiqué juste en dessous, avec le pays le plus
prometteur), et le tableau **Pays par pays** classe les 18 pays.


### Les raisons

Sous le disque, des pastilles donnent la raison du verdict (par exemple « Données insuffisantes : sources à
connecter… ») et les signaux principaux (« Intérêt en baisse (-12 % par an, d'après Wikipédia) », « Pic en mai »).
Les tuiles chiffrées en dessous précisent toujours d'où vient le chiffre : « lecteurs par mois de l'article
Wikipédia » n'est pas un nombre de recherches.

### La lecture par l'IA locale

Si l'IA locale est installée, un cadre avec le badge **IA locale** et un halo discret (la mini aura) apparaît sous le
verdict. Pendant que le modèle écrit, le halo tourne et un compteur de secondes s'affiche ; la première lecture peut
prendre une minute, le temps que le modèle se charge.


La lecture contient un résumé, une phrase par pays, une hypothèse sur ce qu'est le produit et des pistes
« Pour aller plus loin ». Tout ce texte est une **reformulation** de l'analyse : chaque nombre cité a été vérifié
contre l'analyse, et une réponse contenant un nombre inconnu est refusée. L'IA peut quand même se tromper sur le sens
d'une donnée ; les tuiles et la page pays restent la référence.

Si l'IA ne peut pas tourner, le cadre l'explique (« IA locale indisponible », suivi de la raison) et rien n'est
inventé à la place.

### Ta marge

Le panneau **Ta marge** ne part que de tes prix :

- **Coût de revient par unité** : prix fournisseur + livraison + droits de douane, quand ils sont calculables. Sinon,
  la note précise « droits non inclus » ;
- **Marge à ton prix** : avec un prix de vente envisagé ;
- **Prix minimum pour ta marge** : avec une marge visée.

Un champ vide donne `DATA_INSUFFICIENT` avec la raison (« Prix de vente envisagé non renseigné. »).

### Pour obtenir un vrai verdict

Ce panneau liste les sources à brancher, classées par le nombre de points du score qu'elles couvriraient. Le bouton
**Brancher** (ou **Réparer** si une source est configurée mais en échec) mène à son guide.

### Journal des sources

Replié par défaut, il liste chaque source : utilisée, en échec (avec le code d'erreur), non branchée ou pas encore
implémentée, pays par pays, avec la date de collecte.

## Mode simple et mode avancé

Le bouton **Mode avancé**, en haut à droite, change toute l'interface ; **Mode simple** dans la barre latérale fait
le chemin inverse. Le choix est mémorisé dans ton navigateur.

- **Mode simple** : le verdict, la lecture de l'IA, les chiffres clés, la marge et les sources à brancher.
- **Mode avancé** : le score d'opportunité et ses critères, la confiance détaillée, les hypothèses, la provenance de
  chaque valeur, et un formulaire de recherche complet (langue du nom, traductions, choix des pays).

Le bouton **Voir l'analyse complète**, en bas du rapport simple, ouvre directement la vue avancée.

## Les pages pays

Dans le tableau **Pays par pays**, choisis un pays pour ouvrir sa page : demande de recherche et saisonnalité,
intérêt et intention d'achat, potentiel commercial, coûts publicitaires, marché eBay, taxes à l'import, concurrence,
détail du score, confiance, contexte du pays et provenance des données.


Chaque indicateur porte sa nature. Survole une valeur pour voir sa méthode, ses sources et sa période. Les
`DATA_INSUFFICIENT` sont nombreux tant que les sources à clé ne sont pas branchées, et chacun donne sa raison.

Sur téléphone, toutes les pages s'empilent sur une colonne :


## Brancher des sources

La page **Sources de données** montre l'état de chaque connecteur et son guide pas à pas.


Pour chaque source à clé : ouvre **Configurer**, suis les étapes, colle les valeurs, puis utilise le test de
connexion quand il est proposé. En développement sur `localhost`, les valeurs sont écrites dans `.env.local` et
appliquées sans redémarrage ; elles ne sont jamais renvoyées au navigateur. Ailleurs, la page t'indique les lignes à
ajouter toi-même dans `.env.local`.

Ne colle jamais tes clés dans un ticket, une capture d'écran ou un commit.

### Actives sans configuration

Banque mondiale, Eurostat, OCDE, Google Autocomplete (point d'accès non officiel), Wikipédia et Wikidata, GOV.UK Trade
Tariff, USITC HTS, taux de TVA, taux de change BCE et traduction MyMemory sont interrogés à chaque analyse.

Pour Wikipédia, ajoute un contact (`WIKIMEDIA_CONTACT`, un e-mail ou une adresse web) : sans lui, Wikimedia limite à
10 requêtes par minute et une analyse « Monde entier » peut manquer des pays ; avec, la limite passe à 200.

### Gratuites, à brancher

**YouTube Data API v3** (gratuit, 10 000 unités par jour, environ 5 minutes)

1. Active la YouTube Data API v3 dans un projet Google Cloud (bibliothèque d'API).
2. Crée une clé API dans **Identifiants**. Conseillé : restreins-la à la YouTube Data API v3.
3. Colle-la dans `YOUTUBE_API_KEY`.

**eBay Browse API** (gratuit, environ 10 minutes)

1. Crée un compte sur le programme eBay Developers.
2. Dans **Application Keys**, génère un jeu de clés **Production** (pas Sandbox).
3. Débloque le jeu de clés : eBay demande de régler la question des notifications de suppression de compte. EZ-Shop
   ne stocke aucune donnée d'utilisateur eBay, tu peux demander l'exemption.
4. Colle l'App ID dans `EBAY_CLIENT_ID` et le Cert ID dans `EBAY_CLIENT_SECRET`.

**AliExpress Affiliate API** (gratuit, environ 15 minutes, puis validation en 1 à 3 jours ouvrés en général)

1. Rejoins le programme affilié AliExpress Portals et récupère un Tracking ID.
2. Sur l'AliExpress Open Platform, avec le même compte, crée une application de type affilié et attends sa
   validation.
3. Colle l'App Key, l'App Secret et le Tracking ID dans `ALIEXPRESS_APP_KEY`, `ALIEXPRESS_APP_SECRET` et
   `ALIEXPRESS_TRACKING_ID`.

### Sur candidature

**Google Ads API, Keyword Planner** (gratuit, accès Basic requis). C'est la source la plus importante : volumes de
recherche mensuels, concurrence et coût par clic, les seules données qui permettent d'estimer des ventes.

1. Dans un projet Google Cloud, active l'API Google Ads. Le niveau d'accès du projet (Test, Explorer, Basic)
   s'affiche sur sa page Google Ads API.
2. Demande l'accès **Basic** : Keyword Planner l'exige, Explorer ne suffit pas. Tu peux remplir les champs avant
   qu'il soit accordé.
3. Crée un ID client OAuth de type Application Web, avec `https://developers.google.com/oauthplayground` comme URI
   de redirection autorisée. Remplis `GOOGLE_ADS_CLIENT_ID` et `GOOGLE_ADS_CLIENT_SECRET`.
4. Dans l'OAuth Playground, active « Use your own OAuth credentials », autorise le scope
   `https://www.googleapis.com/auth/adwords`, échange le code contre des jetons et copie le refresh token dans
   `GOOGLE_ADS_REFRESH_TOKEN`.
5. Renseigne l'ID du compte Google Ads (`GOOGLE_ADS_CUSTOMER_ID`), celui du compte administrateur si l'accès passe
   par un MCC (`GOOGLE_ADS_LOGIN_CUSTOMER_ID`) et la version la plus récente de l'API (`GOOGLE_ADS_API_VERSION`).

Depuis le 9 septembre 2026, Google Ads ne demande plus de jeton développeur : l'accès dépend du projet Google Cloud
propriétaire du client OAuth.

**Meta Ad Library** (gratuit, identité confirmée requise) : confirme ton identité auprès de Meta, crée une
application Meta for Developers, génère un jeton d'accès utilisateur dans l'explorateur de l'API Graph, puis
renseigne `META_GRAPH_API_VERSION` (format `vNN.0`) et `META_AD_LIBRARY_ACCESS_TOKEN`.

**TikTok Commercial Content API** (gratuit, accès recherche sur candidature) : candidate, puis colle le client key
et le client secret de l'application approuvée dans `TIKTOK_CLIENT_KEY` et `TIKTOK_CLIENT_SECRET`.

**Google Trends API (alpha)** : l'accès se demande à Google, mais le connecteur n'est pas encore codé pour le format
de réponse alpha. Une clé reçue va dans `GOOGLE_TRENDS_API_KEY`.

### À venir

Meta Marketing API et TikTok Business API (coûts publicitaires estimés) ne sont pas encore codés. Leurs identifiants
peuvent être préparés depuis la page **Sources de données**.

## FAQ

**Pourquoi tant de `DATA_INSUFFICIENT` ?**
Parce qu'EZ-Shop préfère dire « je ne sais pas » qu'inventer. Chaque indicateur a besoin d'une source précise :
sans Keyword Planner, pas de volume de recherche ; sans volume, pas d'estimation de ventes ; sans prix saisi, pas de
marge. Chaque `DATA_INSUFFICIENT` donne sa raison et, souvent, la source à brancher.

**Pourquoi les lecteurs Wikipédia ne sont-ils pas des recherches ?**
Le nombre de lecteurs d'un article Wikipédia mesure l'intérêt pour une catégorie (« Casquette »), dans une langue,
pas le nombre de personnes qui cherchent à acheter ce produit dans un pays. EZ-Shop s'en sert pour la tendance et la
saisonnalité quand Google ne donne rien, et l'affiche toujours comme « lecteurs Wikipédia ». Il n'en tire jamais de
volume de ventes. Même chose pour les suggestions Google et les résultats YouTube : ce sont des signaux indirects.

**Pourquoi pas de données par région ou par ville ?**
C'est un choix du projet : l'analyse se fait au niveau pays uniquement. Les sources fiables et comparables existent
surtout à cette échelle, et un découpage plus fin donnerait des chiffres trop fragiles pour être honnêtes.

**Pourquoi EZ-Shop ne lit-il pas la page AliExpress ou Temu ?**
Ces sites interdisent la collecte automatique, et Alibaba et 1688 répondent par un captcha. Le lien est seulement
analysé comme texte. Pour des prix fournisseurs réels sans saisie, branche l'API officielle AliExpress Affiliate.

**Mes données quittent-elles ma machine ?**
Le nom du produit (et ses traductions) part vers les sources interrogées, puisque c'est l'objet de la recherche :
Google Autocomplete, Wikipédia, le service de traduction, les tarifs douaniers et les API que tu as branchées. Tes
prix, tes marges et tes analyses restent dans ta base locale. Tes clés restent dans `.env.local` et ne sont jamais
renvoyées au navigateur. L'IA locale tourne sur ta carte graphique : ni le produit, ni l'analyse, ni sa réponse ne
partent vers un service d'IA. EZ-Shop n'utilise aucun traceur ni aucune statistique d'usage.

**L'IA locale est-elle obligatoire ?**
Non. Sans le modèle ou avec `LOCAL_AI_ENABLED=false`, l'analyse est la même, seule la reformulation manque.

**Puis-je mettre EZ-Shop en ligne ?**
Pas tel quel : il n'y a pas d'authentification. L'application est conçue pour tourner en local.
