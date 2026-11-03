import type { DeepStringShape } from "./types";

/** Settings → Keys and tokens: where the connectors' secrets are kept on this computer. */
export const en = {
  title: "Keys and tokens",
  intro: "The keys, client secrets and tokens of your connectors. They are kept by this computer's own credential store, not in a plain file, and never leave this computer except towards the provider they belong to.",
  stores: { windows: "Windows Credential Manager", macos: "macOS Keychain", linux: "Secret Service (GNOME Keyring, KWallet…)", other: "System credential store" },
  available: "Kept in: {store}.",
  unavailable: "No usable credential store on this computer: secrets stay in .env.local, in plain text. On Linux, install and unlock a Secret Service (GNOME Keyring or KWallet).",
  counts: "{vault} in the credential store, {file} still in plain text in .env.local.",
  move: "Move my keys into the credential store",
  moving: "Moving…",
  moved: "{count} moved. Each one was read back before leaving .env.local.",
  kept: "{count} could not be moved and stay in .env.local.",
  nothing: "No secret left in .env.local.",
  remote: "Keys are handled from this computer only.",
  failed: "The keys could not be moved; nothing was removed.",
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  title: "Clés et jetons",
  intro: "Les clés, secrets clients et jetons de tes connecteurs. Ils sont gardés par le coffre d'identifiants de cet ordinateur, pas dans un fichier en clair, et ne quittent cet ordinateur que vers le fournisseur auquel ils appartiennent.",
  stores: { windows: "Gestionnaire d'identification Windows", macos: "Trousseau macOS", linux: "Secret Service (GNOME Keyring, KWallet…)", other: "Coffre d'identifiants du système" },
  available: "Gardés dans : {store}.",
  unavailable: "Pas de coffre d'identifiants utilisable sur cet ordinateur : les secrets restent dans .env.local, en clair. Sous Linux, installe et déverrouille un Secret Service (GNOME Keyring ou KWallet).",
  counts: "{vault} dans le coffre, {file} encore en clair dans .env.local.",
  move: "Mettre mes clés dans le coffre",
  moving: "Déplacement…",
  moved: "{count} déplacé(s). Chacun a été relu avant de quitter .env.local.",
  kept: "{count} n'ont pas pu être déplacé(s) et restent dans .env.local.",
  nothing: "Plus aucun secret dans .env.local.",
  remote: "Les clés se gèrent uniquement depuis cet ordinateur.",
  failed: "Les clés n'ont pas pu être déplacées ; rien n'a été retiré.",
};

export const es: Shape = {
  title: "Claves y tokens",
  intro: "Las claves, secretos de cliente y tokens de tus conectores. Los guarda el almacén de credenciales de este equipo, no un archivo en claro, y solo salen de este equipo hacia el proveedor al que pertenecen.",
  stores: { windows: "Administrador de credenciales de Windows", macos: "Llavero de macOS", linux: "Secret Service (GNOME Keyring, KWallet…)", other: "Almacén de credenciales del sistema" },
  available: "Guardados en: {store}.",
  unavailable: "No hay un almacén de credenciales utilizable en este equipo: los secretos se quedan en .env.local, en claro. En Linux, instala y desbloquea un Secret Service (GNOME Keyring o KWallet).",
  counts: "{vault} en el almacén, {file} aún en claro en .env.local.",
  move: "Pasar mis claves al almacén",
  moving: "Moviendo…",
  moved: "{count} movido(s). Cada uno se volvió a leer antes de salir de .env.local.",
  kept: "{count} no se pudieron mover y se quedan en .env.local.",
  nothing: "Ya no queda ningún secreto en .env.local.",
  remote: "Las claves solo se gestionan desde este equipo.",
  failed: "No se pudieron mover las claves; no se retiró nada.",
};
