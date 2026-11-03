import type { DeepStringShape } from "./types";

/** Step-by-step guides to connect the owner's Shopify store and Meta ad account. */
export const en = {
  progress: "{done} of {total} steps done",
  minutes: "About {count} minutes",
  done: "Done",
  markDone: "I did this step",
  markUndone: "Not done after all",
  open: "Open {site}",
  copy: "Copy",
  copied: "Copied",
  checked: "Checked by EZ-Shop",
  show: "See the guide",
  hide: "Hide the guide",
  connected: "Connected",
  optional: "If needed",
  scopes: { title: "Permissions your store granted", granted: "granted", missing: "missing", none: "Connect the store to see them." },
  shopify: {
    title: "Connect your Shopify store, step by step",
    intro: "You create a small private app in Shopify, give it read-only access, then paste its two keys here. EZ-Shop can read your store; it can never change anything in it.",
    steps: {
      dashboard: {
        title: "Open Shopify's Dev Dashboard",
        body: "It is the space where Shopify keeps the apps you make yourself. Sign in with the same account as your store. You can also get there from your store's admin: Settings → Apps → Develop apps.",
      },
      create: {
        title: "Create the app",
        body: "Click “Create app” at the top right, then “Start from Dev Dashboard”. Name it EZ-Shop (any name works) and click “Create”.",
      },
      scopes: {
        title: "Allow it to read your store",
        body: "Open the “Versions” tab. Leave “App URL” as proposed. In “Scopes”, paste the list below with the Copy button. They are read permissions only: products, stock, orders, statistics, markets and shipping.",
      },
      release: {
        title: "Release the version",
        body: "Click “Release”. Shopify saves this setup as the app's first version.",
      },
      customerData: {
        title: "Allow the protected customer data",
        body: "Shopify protects customer addresses: without this access, orders have no country and the visits cannot be read. In the app's settings, find “Protected customer data”, tick it with the “Name” and “Address” fields, and give as reason “private dashboard of my own store”. On a development store, nothing has to be reviewed.",
      },
      install: {
        title: "Install the app on your store",
        body: "Back on the app's page, click “Install app” on the “Installs” card, pick your store and click “Install”. If you add permissions later, do this step again: Shopify asks you to accept them.",
      },
      keys: {
        title: "Copy the two keys",
        body: "In the app's “Settings”, copy the “Client ID”, then the “Client secret”. The secret works like a password: never share it or post it anywhere.",
      },
      paste: {
        title: "Paste them here",
        body: "Fill in the three fields below: your store's xxx.myshopify.com address (in the Shopify admin: Settings → Domains), the Client ID and the Client secret. Click “Save”.",
      },
      check: {
        title: "Check",
        body: "The page reads your store again. The list of permissions below ticks each one Shopify granted; a missing one means going back to step 3, then step 6.",
      },
    },
  },
  meta: {
    title: "Connect your Meta ad account, step by step",
    intro: "You create a free developer app at Meta, generate a read-only key (a token) for your ad account, then paste it here with the account's number. EZ-Shop reads your results; it can never create or change an ad.",
    steps: {
      account: {
        title: "Check that you have an ad account",
        body: "Open Ads Manager. If Meta offers to create an ad account, do it: without one there is nothing to read.",
      },
      accountId: {
        title: "Note the account's number",
        body: "It is in the page address, after “act=”, or in Account settings → Account overview. Only digits, such as 123456789.",
      },
      developer: {
        title: "Become a Meta developer",
        body: "On Meta for Developers, click “Get started” and accept the terms with your Facebook account. It is free and takes a minute.",
      },
      app: {
        title: "Create an app",
        body: "Give it a name (EZ-Shop) and your e-mail, then “Next”. In the use cases, choose the one about ads or the Marketing API; if none is listed, choose “Other”, then the “Business” type. Connect it to your business portfolio if Meta asks, then click “Go to dashboard”.",
      },
      token: {
        title: "Generate a read-only token",
        body: "In the Graph API Explorer: pick your app in “Meta App”, choose “User Token” in “User or Page”, add the ads_read permission, then click “Generate Access Token” and accept. A long text appears: that is the token.",
      },
      extend: {
        title: "Make it last 60 days",
        body: "A fresh token lasts about an hour. Paste it into the Access Token Debugger, click “Debug”, then “Extend Access Token” at the bottom, and copy the new token: it lasts about 60 days. For a token that does not expire, create a system user in Business settings → System users, give it your ad account, then “Generate new token” with ads_read.",
      },
      paste: {
        title: "Paste them here",
        body: "Fill in the token and the ad account number in the fields below, then “Save”. The token is stored on this computer only.",
      },
      read: {
        title: "Read your results",
        body: "Open the Ads tab and click “Load the results”. If Meta refuses the token, it has expired: go back to step 5.",
      },
    },
  },
  google: {
    title: "Google Ads",
    body: "Google Ads is connected in Data sources, with its own guide: the same account then gives Keyword Planner and your campaigns' results here.",
    link: "Open the Google Ads guide",
  },
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  progress: "{done} étapes faites sur {total}",
  minutes: "Environ {count} minutes",
  done: "Fait",
  markDone: "J'ai fait cette étape",
  markUndone: "Finalement pas fait",
  open: "Ouvrir {site}",
  copy: "Copier",
  copied: "Copié",
  checked: "Vérifié par EZ-Shop",
  show: "Voir le tuto",
  hide: "Masquer le tuto",
  connected: "Connecté",
  optional: "Si besoin",
  scopes: { title: "Droits accordés par ta boutique", granted: "accordé", missing: "manquant", none: "Connecte la boutique pour les voir." },
  shopify: {
    title: "Connecter ta boutique Shopify, pas à pas",
    intro: "Tu crées une petite app privée dans Shopify, tu lui donnes un accès en lecture seule, puis tu colles ses deux clés ici. EZ-Shop peut lire ta boutique ; il ne peut jamais rien y changer.",
    steps: {
      dashboard: {
        title: "Ouvre le Dev Dashboard de Shopify",
        body: "C'est l'espace où Shopify range les apps que tu crées toi-même. Connecte-toi avec le même compte que ta boutique. Tu peux aussi y aller depuis l'admin de ta boutique : Paramètres → Applications → Développer des applications.",
      },
      create: {
        title: "Crée l'app",
        body: "Clique sur « Create app » en haut à droite, puis sur « Start from Dev Dashboard ». Appelle-la EZ-Shop (n'importe quel nom marche) et clique sur « Create ».",
      },
      scopes: {
        title: "Autorise-la à lire ta boutique",
        body: "Ouvre l'onglet « Versions ». Laisse « App URL » tel quel. Dans « Scopes », colle la liste ci-dessous avec le bouton Copier. Ce ne sont que des droits de lecture : produits, stock, commandes, statistiques, marchés et livraison.",
      },
      release: {
        title: "Publie la version",
        body: "Clique sur « Release ». Shopify enregistre ce réglage comme première version de l'app.",
      },
      customerData: {
        title: "Autorise les données clients protégées",
        body: "Shopify protège les adresses des clients : sans cet accès, les commandes n'ont pas de pays et les visites ne peuvent pas être lues. Dans les réglages de l'app, trouve « Protected customer data », coche-le avec les champs « Name » et « Address », et donne comme raison « tableau de bord privé de ma propre boutique ». Sur une boutique de développement, rien n'a besoin d'être validé.",
      },
      install: {
        title: "Installe l'app sur ta boutique",
        body: "Reviens sur la page de l'app, clique sur « Install app » dans la carte « Installs », choisis ta boutique puis « Install ». Si tu ajoutes des droits plus tard, refais cette étape : Shopify te demande de les accepter.",
      },
      keys: {
        title: "Copie les deux clés",
        body: "Dans « Settings » de l'app, copie le « Client ID », puis le « Client secret ». Le secret marche comme un mot de passe : ne le partage jamais et ne le publie nulle part.",
      },
      paste: {
        title: "Colle-les ici",
        body: "Remplis les trois champs juste en dessous : l'adresse xxx.myshopify.com de ta boutique (dans l'admin Shopify : Paramètres → Domaines), le Client ID et le Client secret. Clique sur « Enregistrer ».",
      },
      check: {
        title: "Vérifie",
        body: "La page relit ta boutique. La liste des droits ci-dessous coche chacun de ceux que Shopify a accordés ; s'il en manque un, reviens à l'étape 3, puis à l'étape 6.",
      },
    },
  },
  meta: {
    title: "Connecter ton compte pub Meta, pas à pas",
    intro: "Tu crées une app développeur gratuite chez Meta, tu génères une clé en lecture seule (un jeton) pour ton compte publicitaire, puis tu la colles ici avec le numéro du compte. EZ-Shop lit tes résultats ; il ne peut jamais créer ni modifier une pub.",
    steps: {
      account: {
        title: "Vérifie que tu as un compte publicitaire",
        body: "Ouvre le Gestionnaire de publicités. Si Meta te propose de créer un compte publicitaire, fais-le : sans compte, il n'y a rien à lire.",
      },
      accountId: {
        title: "Note le numéro du compte",
        body: "Il est dans l'adresse de la page, après « act= », ou dans Paramètres du compte → Vue d'ensemble. Uniquement des chiffres, comme 123456789.",
      },
      developer: {
        title: "Deviens développeur Meta",
        body: "Sur Meta for Developers, clique sur « Commencer » et accepte les conditions avec ton compte Facebook. C'est gratuit et ça prend une minute.",
      },
      app: {
        title: "Crée une app",
        body: "Donne-lui un nom (EZ-Shop) et ton e-mail, puis « Suivant ». Dans les cas d'usage, choisis celui qui parle de publicités ou de l'API Marketing ; s'il n'y en a pas, choisis « Autre », puis le type « Entreprise ». Relie-la à ton portefeuille business si Meta le demande, puis clique sur « Accéder au tableau de bord ».",
      },
      token: {
        title: "Génère un jeton en lecture seule",
        body: "Dans l'Explorateur de l'API Graph : choisis ton app dans « Meta App », prends « User Token » dans « User or Page », ajoute la permission ads_read, puis clique sur « Generate Access Token » et accepte. Un long texte apparaît : c'est le jeton.",
      },
      extend: {
        title: "Fais-le durer 60 jours",
        body: "Un jeton tout neuf dure environ une heure. Colle-le dans l'outil de débogage des jetons, clique sur « Debug », puis sur « Extend Access Token » tout en bas, et copie le nouveau jeton : il dure environ 60 jours. Pour un jeton qui n'expire pas, crée un utilisateur système dans Paramètres de l'entreprise → Utilisateurs système, donne-lui ton compte publicitaire, puis « Générer un nouveau jeton » avec ads_read.",
      },
      paste: {
        title: "Colle-les ici",
        body: "Remplis le jeton et le numéro du compte publicitaire dans les champs ci-dessous, puis « Enregistrer ». Le jeton n'est gardé que sur cet ordinateur.",
      },
      read: {
        title: "Lis tes résultats",
        body: "Ouvre l'onglet Publicités et clique sur « Charger les résultats ». Si Meta refuse le jeton, c'est qu'il a expiré : reviens à l'étape 5.",
      },
    },
  },
  google: {
    title: "Google Ads",
    body: "Google Ads se connecte dans Sources de données, avec son propre tuto : le même compte donne ensuite Keyword Planner et ici les résultats de tes campagnes.",
    link: "Ouvrir le tuto Google Ads",
  },
};

export const es: Shape = {
  progress: "{done} de {total} pasos hechos",
  minutes: "Unos {count} minutos",
  done: "Hecho",
  markDone: "He hecho este paso",
  markUndone: "Al final no está hecho",
  open: "Abrir {site}",
  copy: "Copiar",
  copied: "Copiado",
  checked: "Comprobado por EZ-Shop",
  show: "Ver la guía",
  hide: "Ocultar la guía",
  connected: "Conectado",
  optional: "Si hace falta",
  scopes: { title: "Permisos que dio tu tienda", granted: "dado", missing: "falta", none: "Conecta la tienda para verlos." },
  shopify: {
    title: "Conectar tu tienda Shopify, paso a paso",
    intro: "Creas una pequeña app privada en Shopify, le das acceso de solo lectura y pegas aquí sus dos claves. EZ-Shop puede leer tu tienda; nunca puede cambiar nada en ella.",
    steps: {
      dashboard: {
        title: "Abre el Dev Dashboard de Shopify",
        body: "Es el espacio donde Shopify guarda las apps que creas tú. Inicia sesión con la misma cuenta que tu tienda. También puedes llegar desde el admin de tu tienda: Configuración → Aplicaciones → Desarrollar aplicaciones.",
      },
      create: {
        title: "Crea la app",
        body: "Haz clic en « Create app » arriba a la derecha y luego en « Start from Dev Dashboard ». Llámala EZ-Shop (vale cualquier nombre) y haz clic en « Create ».",
      },
      scopes: {
        title: "Permítele leer tu tienda",
        body: "Abre la pestaña « Versions ». Deja « App URL » como está. En « Scopes », pega la lista de abajo con el botón Copiar. Solo son permisos de lectura: productos, stock, pedidos, estadísticas, mercados y envíos.",
      },
      release: {
        title: "Publica la versión",
        body: "Haz clic en « Release ». Shopify guarda esta configuración como la primera versión de la app.",
      },
      customerData: {
        title: "Permite los datos protegidos de clientes",
        body: "Shopify protege las direcciones de los clientes: sin este acceso, los pedidos no tienen país y las visitas no se pueden leer. En la configuración de la app, busca « Protected customer data », márcalo con los campos « Name » y « Address » y da como motivo « panel privado de mi propia tienda ». En una tienda de desarrollo no hace falta ninguna revisión.",
      },
      install: {
        title: "Instala la app en tu tienda",
        body: "De vuelta en la página de la app, haz clic en « Install app » en la tarjeta « Installs », elige tu tienda y luego « Install ». Si añades permisos más tarde, repite este paso: Shopify te pide aceptarlos.",
      },
      keys: {
        title: "Copia las dos claves",
        body: "En « Settings » de la app, copia el « Client ID » y luego el « Client secret ». El secreto funciona como una contraseña: nunca lo compartas ni lo publiques.",
      },
      paste: {
        title: "Pégalas aquí",
        body: "Rellena los tres campos de abajo: la dirección xxx.myshopify.com de tu tienda (en el admin de Shopify: Configuración → Dominios), el Client ID y el Client secret. Haz clic en « Guardar ».",
      },
      check: {
        title: "Comprueba",
        body: "La página vuelve a leer tu tienda. La lista de permisos de abajo marca cada uno que Shopify dio; si falta alguno, vuelve al paso 3 y luego al paso 6.",
      },
    },
  },
  meta: {
    title: "Conectar tu cuenta publicitaria de Meta, paso a paso",
    intro: "Creas una app de desarrollador gratuita en Meta, generas una clave de solo lectura (un token) para tu cuenta publicitaria y la pegas aquí con el número de la cuenta. EZ-Shop lee tus resultados; nunca puede crear ni cambiar un anuncio.",
    steps: {
      account: {
        title: "Comprueba que tienes una cuenta publicitaria",
        body: "Abre el Administrador de anuncios. Si Meta te propone crear una cuenta publicitaria, hazlo: sin cuenta no hay nada que leer.",
      },
      accountId: {
        title: "Apunta el número de la cuenta",
        body: "Está en la dirección de la página, después de « act= », o en Configuración de la cuenta → Información general. Solo cifras, como 123456789.",
      },
      developer: {
        title: "Hazte desarrollador de Meta",
        body: "En Meta for Developers, haz clic en « Empezar » y acepta las condiciones con tu cuenta de Facebook. Es gratis y lleva un minuto.",
      },
      app: {
        title: "Crea una app",
        body: "Ponle un nombre (EZ-Shop) y tu correo, luego « Siguiente ». En los casos de uso, elige el de anuncios o de la API de marketing; si no aparece, elige « Otro » y luego el tipo « Negocios ». Vincúlala a tu portfolio comercial si Meta lo pide y haz clic en « Ir al panel ».",
      },
      token: {
        title: "Genera un token de solo lectura",
        body: "En el Explorador de la API Graph: elige tu app en « Meta App », toma « User Token » en « User or Page », añade el permiso ads_read y haz clic en « Generate Access Token » y acepta. Aparece un texto largo: es el token.",
      },
      extend: {
        title: "Haz que dure 60 días",
        body: "Un token nuevo dura una hora más o menos. Pégalo en el depurador de tokens, haz clic en « Debug » y luego en « Extend Access Token » abajo del todo, y copia el token nuevo: dura unos 60 días. Para un token que no caduca, crea un usuario del sistema en Configuración del negocio → Usuarios del sistema, dale tu cuenta publicitaria y luego « Generar nuevo token » con ads_read.",
      },
      paste: {
        title: "Pégalos aquí",
        body: "Rellena el token y el número de la cuenta publicitaria en los campos de abajo y luego « Guardar ». El token solo se guarda en este ordenador.",
      },
      read: {
        title: "Lee tus resultados",
        body: "Abre la pestaña Anuncios y haz clic en « Cargar los resultados ». Si Meta rechaza el token, ha caducado: vuelve al paso 5.",
      },
    },
  },
  google: {
    title: "Google Ads",
    body: "Google Ads se conecta en Fuentes de datos, con su propia guía: la misma cuenta da luego Keyword Planner y aquí los resultados de tus campañas.",
    link: "Abrir la guía de Google Ads",
  },
};
