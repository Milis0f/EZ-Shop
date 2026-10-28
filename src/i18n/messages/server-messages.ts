import type { DeepStringShape } from "./types";

/**
 * Server-side messages: input validation (src/domain/schemas.ts) and API errors (route handlers).
 * The schema stores message keys, not text: `localizeInputIssue` (src/domain/validation-messages.ts)
 * turns them into these strings at the edge, with numbers formatted for the locale.
 * Placeholders: {min}, {max}, {amount}, {zero} are already formatted; {platform} is a brand name.
 */
export const en = {
  validation: {
    /** Fallback for an issue the schema has no own message for (wrong type, unknown country...). */
    invalidValue: "Invalid value.",
    productName: {
      tooShort: "Product name too short",
      forbidden: "The product name contains characters that are not allowed.",
    },
    category: {
      tooShort: "Category too short (at least {min} characters).",
      tooLong: "Category too long (at most {max} characters).",
      forbidden: "The category contains characters that are not allowed.",
    },
    extraTerm: {
      forbidden: "This term contains characters that are not allowed.",
    },
    countries: {
      none: "Select at least one country",
    },
    dataMode: {
      mockRemoved: "Mock data has been removed from the app.",
      unknown: "Unknown data mode.",
    },
    hsCode: {
      format: "HS code: {min} to {max} digits",
    },
    supplierUrl: {
      forbidden: "The address contains characters that are not allowed.",
      tooLong: "Address too long (at most {max} characters).",
      whitespace: "Invalid address: paste the full address of the product page, without spaces.",
      shortLink: "Short link: open it and paste the final address of the product page.",
      malformed: "Invalid address: paste the full address of the product page.",
      notWeb: "Address refused: only http or https web addresses are accepted.",
      notProduct: "This {platform} link does not lead to a product page: paste the address of the product page.",
    },
    sellingPrice: {
      notNumber: "Selling price: enter a number.",
      tooLarge: "Selling price: {max} at most.",
      notPositive: "Selling price: enter an amount above {zero}.",
    },
    supplierPrice: {
      notNumber: "Supplier price: enter a number.",
      tooLarge: "Supplier price: {max} at most.",
      notPositive: "Supplier price: enter an amount above {zero}.",
    },
    shippingCost: {
      notNumber: "Shipping cost: enter a number.",
      tooLarge: "Shipping cost: {max} at most.",
      negative: "Shipping cost: the amount cannot be negative.",
    },
    landedCost: {
      notNumber: "Landed cost: enter a number.",
      tooLarge: "Landed cost: {max} at most.",
      notPositive: "Landed cost: enter an amount above {zero}.",
      withShipping: "Landed cost: it already includes delivery. Enter the supplier price and the shipping cost instead.",
    },
    targetMargin: {
      notNumber: "Target margin: enter a number.",
      range: "Target margin: between {min} and {max}.",
    },
    distribution: {
      order: "min ≤ mode ≤ max required",
    },
  },
  api: {
    invalidInput: "Invalid input.",
    internalError: "Internal error.",
    invalidJson: "Invalid JSON body.",
    notFound: "Analysis not found.",
    unsupportedMediaType: "Content-Type application/json required.",
    forbiddenOrigin: "Origin not allowed.",
    analysisRateLimited: "Too many analyses, try again later.",
    aiRateLimited: "Too many AI requests, try again later.",
  },
} as const;

type Shape = DeepStringShape<typeof en>;

export const fr: Shape = {
  validation: {
    invalidValue: "Valeur invalide.",
    productName: {
      tooShort: "Nom de produit trop court",
      forbidden: "Le nom du produit contient des caractères non autorisés.",
    },
    category: {
      tooShort: "Catégorie trop courte ({min} caractères au moins).",
      tooLong: "Catégorie trop longue ({max} caractères au plus).",
      forbidden: "La catégorie contient des caractères non autorisés.",
    },
    extraTerm: {
      forbidden: "Ce terme contient des caractères non autorisés.",
    },
    countries: {
      none: "Sélectionne au moins un pays",
    },
    dataMode: {
      mockRemoved: "Les données fictives ont été retirées de l'application.",
      unknown: "Mode de données inconnu.",
    },
    hsCode: {
      format: "Code SH : {min} à {max} chiffres",
    },
    supplierUrl: {
      forbidden: "L'adresse contient des caractères non autorisés.",
      tooLong: "Adresse trop longue ({max} caractères au plus).",
      whitespace: "Adresse invalide : colle l'adresse complète de la fiche produit, sans espace.",
      shortLink: "Lien court : ouvre-le et colle l'adresse finale de la fiche produit.",
      malformed: "Adresse invalide : colle l'adresse complète de la fiche produit.",
      notWeb: "Adresse refusée : seules les adresses web en http ou https sont acceptées.",
      notProduct: "Ce lien {platform} ne mène pas à une fiche produit : colle l'adresse de la fiche.",
    },
    sellingPrice: {
      notNumber: "Prix de vente : saisis un nombre.",
      tooLarge: "Prix de vente : {max} au plus.",
      notPositive: "Prix de vente : indique un montant supérieur à {zero}.",
    },
    supplierPrice: {
      notNumber: "Prix fournisseur : saisis un nombre.",
      tooLarge: "Prix fournisseur : {max} au plus.",
      notPositive: "Prix fournisseur : indique un montant supérieur à {zero}.",
    },
    shippingCost: {
      notNumber: "Frais de livraison : saisis un nombre.",
      tooLarge: "Frais de livraison : {max} au plus.",
      negative: "Frais de livraison : le montant ne peut pas être négatif.",
    },
    landedCost: {
      notNumber: "Coût de revient : saisis un nombre.",
      tooLarge: "Coût de revient : {max} au plus.",
      notPositive: "Coût de revient : indique un montant supérieur à {zero}.",
      withShipping:
        "Coût de revient : il inclut déjà la livraison. Indique plutôt le prix fournisseur et les frais de livraison.",
    },
    targetMargin: {
      notNumber: "Marge visée : saisis un nombre.",
      range: "Marge visée : entre {min} et {max}.",
    },
    distribution: {
      order: "min ≤ mode ≤ max requis",
    },
  },
  api: {
    invalidInput: "Entrée invalide.",
    internalError: "Erreur interne.",
    invalidJson: "Corps JSON invalide.",
    notFound: "Analyse introuvable.",
    unsupportedMediaType: "Content-Type application/json requis.",
    forbiddenOrigin: "Origine non autorisée.",
    analysisRateLimited: "Trop d'analyses, réessaie plus tard.",
    aiRateLimited: "Trop de demandes à l'IA, réessaie plus tard.",
  },
};

export const es: Shape = {
  validation: {
    invalidValue: "Valor no válido.",
    productName: {
      tooShort: "Nombre de producto demasiado corto",
      forbidden: "El nombre del producto contiene caracteres no permitidos.",
    },
    category: {
      tooShort: "Categoría demasiado corta (mínimo {min} caracteres).",
      tooLong: "Categoría demasiado larga (máximo {max} caracteres).",
      forbidden: "La categoría contiene caracteres no permitidos.",
    },
    extraTerm: {
      forbidden: "Este término contiene caracteres no permitidos.",
    },
    countries: {
      none: "Selecciona al menos un país",
    },
    dataMode: {
      mockRemoved: "Los datos ficticios se han eliminado de la aplicación.",
      unknown: "Modo de datos desconocido.",
    },
    hsCode: {
      format: "Código SA: de {min} a {max} dígitos",
    },
    supplierUrl: {
      forbidden: "La dirección contiene caracteres no permitidos.",
      tooLong: "Dirección demasiado larga (máximo {max} caracteres).",
      whitespace: "Dirección no válida: pega la dirección completa de la ficha del producto, sin espacios.",
      shortLink: "Enlace corto: ábrelo y pega la dirección final de la ficha del producto.",
      malformed: "Dirección no válida: pega la dirección completa de la ficha del producto.",
      notWeb: "Dirección rechazada: solo se aceptan direcciones web http o https.",
      notProduct: "Este enlace de {platform} no lleva a una ficha de producto: pega la dirección de la ficha.",
    },
    sellingPrice: {
      notNumber: "Precio de venta: introduce un número.",
      tooLarge: "Precio de venta: {max} como máximo.",
      notPositive: "Precio de venta: indica un importe superior a {zero}.",
    },
    supplierPrice: {
      notNumber: "Precio del proveedor: introduce un número.",
      tooLarge: "Precio del proveedor: {max} como máximo.",
      notPositive: "Precio del proveedor: indica un importe superior a {zero}.",
    },
    shippingCost: {
      notNumber: "Gastos de envío: introduce un número.",
      tooLarge: "Gastos de envío: {max} como máximo.",
      negative: "Gastos de envío: el importe no puede ser negativo.",
    },
    landedCost: {
      notNumber: "Coste puesto en destino: introduce un número.",
      tooLarge: "Coste puesto en destino: {max} como máximo.",
      notPositive: "Coste puesto en destino: indica un importe superior a {zero}.",
      withShipping: "Coste puesto en destino: ya incluye el envío. Indica mejor el precio del proveedor y los gastos de envío.",
    },
    targetMargin: {
      notNumber: "Margen objetivo: introduce un número.",
      range: "Margen objetivo: entre {min} y {max}.",
    },
    distribution: {
      order: "se requiere mín. ≤ moda ≤ máx.",
    },
  },
  api: {
    invalidInput: "Entrada no válida.",
    internalError: "Error interno.",
    invalidJson: "Cuerpo JSON no válido.",
    notFound: "Análisis no encontrado.",
    unsupportedMediaType: "Se requiere Content-Type application/json.",
    forbiddenOrigin: "Origen no permitido.",
    analysisRateLimited: "Demasiados análisis, inténtalo más tarde.",
    aiRateLimited: "Demasiadas solicitudes a la IA, inténtalo más tarde.",
  },
};
