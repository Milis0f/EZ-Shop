import type { DeepStringShape } from "./types";

/**
 * Local AI reading of an analysis (src/components/ai, src/components/analysis/ai-insight.tsx) and the
 * reasons the server gives when it cannot show one (src/server/ai). The prompts and the fact sheet the
 * model reads are not interface text: they live server-side in src/server/ai/prompt-words.ts.
 */
export const en = {
  badge: "Local AI",
  /** Between a name and its sentence ("France: …"); French puts a space before the colon. */
  colon: ": ",
  intro: "The local AI's rewording of the analysis, not data.",
  status: {
    thinking: "The local AI is reading this analysis",
    ready: "The local AI's reading is ready.",
    unavailable: "Local AI unavailable. {reason}",
    rejected: "AI text discarded. {reason}",
    error: "The AI reading failed: {message}",
  },
  thinkingHint: "The first reading can take a minute: the model is loading on your computer.",
  elapsed: "{seconds} s",
  retry: "Try again",
  product: {
    heading: "What it probably is",
    hypothesis: "Hypothesis read from the product name",
  },
  countries: {
    showOne: "Show the other country",
    showMany: "Show the {count} other countries",
    hide: "Hide the other countries",
    noLine: "No AI sentence for: {countries}.",
  },
  nextSteps: "Going further",
  footer: {
    text: "Written by {model} on your computer, from this analysis's data alone. Every number cited appears in the analysis data; the AI can still misread what they mean. {timing}",
    license: "Licence {license}",
    cached: "Reading kept in memory.",
    duration: "Read in {seconds} s.",
  },
  clientErrors: {
    http: "the server answered {status}.",
    unexpected: "unexpected answer from the server.",
    timeout: "the local AI did not answer in time.",
    network: "the server is not responding.",
  },
  reasons: {
    analysisFailed: "The analysis failed: there is nothing to read.",
    analysisNotDone: "The analysis is not finished: there is nothing to read.",
    tooLong: "This analysis is too long for the local AI ({count} countries to read at once): the reading was not started.",
    engineStart: "The local AI engine could not start.",
    generationFailed: "The local AI could not finish its answer (time limit reached or engine error). Try again later.",
    incomplete: "The AI's answer is incomplete (cut off before the end).",
    badFormat: "The AI's answer does not have the expected format.",
    unsupportedNumber: "The AI cited a number that is not in the analysis data: reading discarded.",
    disabled: "Local AI is turned off (LOCAL_AI_ENABLED=false).",
    modelMissing: "Model not found ({file}). Put the GGUF file where LOCAL_AI_MODEL_PATH points.",
    loadFailed: "The local AI engine could not start ({error}). You can try again in a minute.",
    stuck: "The local AI engine did not stop after a time limit was reached. You can try again in a minute.",
  },
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  badge: "IA locale",
  colon: " : ",
  intro: "Reformulation de l'analyse par l'IA locale, pas une donnée.",
  status: {
    thinking: "L'IA locale lit cette analyse",
    ready: "Lecture de l'IA locale prête.",
    unavailable: "IA locale indisponible. {reason}",
    rejected: "Texte de l'IA écarté. {reason}",
    error: "Lecture par l'IA impossible : {message}",
  },
  thinkingHint: "La première lecture peut prendre une minute : le modèle se charge sur ton ordinateur.",
  elapsed: "{seconds} s",
  retry: "Réessayer",
  product: {
    heading: "Ce que c'est, probablement",
    hypothesis: "Hypothèse lue dans le nom du produit",
  },
  countries: {
    showOne: "Voir l'autre pays",
    showMany: "Voir les {count} autres pays",
    hide: "Masquer les autres pays",
    noLine: "Pas de phrase de l'IA pour : {countries}.",
  },
  nextSteps: "Pour aller plus loin",
  footer: {
    text: "Rédigé par {model} sur ton ordinateur, à partir des seules données de cette analyse. Chaque nombre cité figure dans les données de l'analyse ; l'IA peut se tromper sur leur sens. {timing}",
    license: "Licence {license}",
    cached: "Lecture gardée en mémoire.",
    duration: "Lu en {seconds} s.",
  },
  clientErrors: {
    http: "le serveur a répondu {status}.",
    unexpected: "réponse inattendue du serveur.",
    timeout: "l'IA locale n'a pas répondu à temps.",
    network: "le serveur ne répond pas.",
  },
  reasons: {
    analysisFailed: "L'analyse a échoué : il n'y a rien à relire.",
    analysisNotDone: "L'analyse n'est pas terminée : il n'y a rien à relire.",
    tooLong: "Cette analyse est trop longue pour l'IA locale ({count} pays à relire d'un coup) : la relecture n'a pas été lancée.",
    engineStart: "Le moteur d'IA locale n'a pas pu démarrer.",
    generationFailed: "L'IA locale n'a pas pu terminer sa réponse (délai dépassé ou erreur du moteur). Réessaie plus tard.",
    incomplete: "La réponse de l'IA est incomplète (coupée avant la fin).",
    badFormat: "La réponse de l'IA n'a pas le format attendu.",
    unsupportedNumber: "L'IA a cité un nombre absent des données de l'analyse : relecture écartée.",
    disabled: "IA locale désactivée (LOCAL_AI_ENABLED=false).",
    modelMissing: "Modèle introuvable ({file}). Place le fichier GGUF à l'endroit indiqué par LOCAL_AI_MODEL_PATH.",
    loadFailed: "Le moteur d'IA locale n'a pas pu démarrer ({error}). Nouvel essai possible dans une minute.",
    stuck: "Le moteur d'IA locale ne s'est pas arrêté après un délai dépassé. Nouvel essai possible dans une minute.",
  },
};

export const es: Shape = {
  badge: "IA local",
  colon: ": ",
  intro: "Reformulación del análisis por la IA local, no un dato.",
  status: {
    thinking: "La IA local está leyendo este análisis",
    ready: "La lectura de la IA local está lista.",
    unavailable: "IA local no disponible. {reason}",
    rejected: "Texto de la IA descartado. {reason}",
    error: "No se pudo obtener la lectura de la IA: {message}",
  },
  thinkingHint: "La primera lectura puede tardar un minuto: el modelo se está cargando en tu ordenador.",
  elapsed: "{seconds} s",
  retry: "Reintentar",
  product: {
    heading: "Qué es, probablemente",
    hypothesis: "Hipótesis deducida del nombre del producto",
  },
  countries: {
    showOne: "Ver el otro país",
    showMany: "Ver los otros {count} países",
    hide: "Ocultar los demás países",
    noLine: "Sin frase de la IA para: {countries}.",
  },
  nextSteps: "Para ir más allá",
  footer: {
    text: "Redactado por {model} en tu ordenador, solo con los datos de este análisis. Cada número citado figura en los datos del análisis; la IA puede equivocarse sobre su sentido. {timing}",
    license: "Licencia {license}",
    cached: "Lectura guardada en memoria.",
    duration: "Leído en {seconds} s.",
  },
  clientErrors: {
    http: "el servidor respondió {status}.",
    unexpected: "respuesta inesperada del servidor.",
    timeout: "la IA local no respondió a tiempo.",
    network: "el servidor no responde.",
  },
  reasons: {
    analysisFailed: "El análisis ha fallado: no hay nada que leer.",
    analysisNotDone: "El análisis no ha terminado: no hay nada que leer.",
    tooLong: "Este análisis es demasiado largo para la IA local ({count} países a la vez): no se ha iniciado la lectura.",
    engineStart: "El motor de IA local no ha podido arrancar.",
    generationFailed: "La IA local no ha podido terminar su respuesta (tiempo agotado o error del motor). Inténtalo más tarde.",
    incomplete: "La respuesta de la IA está incompleta (cortada antes del final).",
    badFormat: "La respuesta de la IA no tiene el formato esperado.",
    unsupportedNumber: "La IA ha citado un número que no figura en los datos del análisis: lectura descartada.",
    disabled: "IA local desactivada (LOCAL_AI_ENABLED=false).",
    modelMissing: "Modelo no encontrado ({file}). Coloca el archivo GGUF donde indica LOCAL_AI_MODEL_PATH.",
    loadFailed: "El motor de IA local no ha podido arrancar ({error}). Puedes volver a intentarlo dentro de un minuto.",
    stuck: "El motor de IA local no se ha detenido tras agotar el tiempo. Puedes volver a intentarlo dentro de un minuto.",
  },
};
