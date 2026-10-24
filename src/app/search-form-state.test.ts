import { describe, expect, it } from "vitest";
import { searchFormStateFrom } from "./search-form-state";

const MOCK_REMOVED = "Les données fictives ont été retirées de l'application.";
const SHORT_LINK = "Lien court : ouvre-le et colle l'adresse finale de la fiche produit.";

describe("searchFormStateFrom", () => {
  it("shows a refused mock mode as the form error, since no field holds it", () => {
    expect(searchFormStateFrom([{ path: "dataMode", message: MOCK_REMOVED }])).toEqual({ error: MOCK_REMOVED });
  });

  it("keys messages by the form field that holds the value, prices under their group", () => {
    const state = searchFormStateFrom([
      { path: "supplierUrl", message: SHORT_LINK },
      { path: "category", message: "Catégorie trop courte (2 caractères au moins)." },
      { path: "economics.supplierPrice", message: "Prix fournisseur : 100 000 € au plus." },
    ]);

    expect(state).toEqual({
      fieldErrors: {
        supplierUrl: SHORT_LINK,
        category: "Catégorie trop courte (2 caractères au moins).",
        economics: "Prix fournisseur : 100 000 € au plus.",
      },
    });
  });

  it("shows every distinct message of a field in order, so no price error waits for a resubmit", () => {
    const state = searchFormStateFrom([
      { path: "economics.supplierPrice", message: "Prix fournisseur : indique un montant supérieur à 0 €." },
      { path: "economics.shippingCost", message: "Frais de livraison : le montant ne peut pas être négatif." },
      { path: "extraTerms.0.term", message: "Ce terme contient des caractères non autorisés." },
      { path: "economics.targetMarginPct", message: "Marge visée : entre 1 et 95 %." },
      { path: "extraTerms.3.term", message: "Ce terme contient des caractères non autorisés." },
    ]);

    expect(state).toEqual({
      fieldErrors: {
        economics:
          "Prix fournisseur : indique un montant supérieur à 0 €. Frais de livraison : le montant ne peut pas être négatif. Marge visée : entre 1 et 95 %.",
        extraTerms: "Ce terme contient des caractères non autorisés.",
      },
    });
  });

  it("shows every distinct form-level message in order, like the field messages", () => {
    const state = searchFormStateFrom([
      { path: "dataMode", message: MOCK_REMOVED },
      { path: "", message: "Entrée invalide." },
      { path: "dataMode", message: MOCK_REMOVED },
    ]);

    expect(state).toEqual({ error: `${MOCK_REMOVED} Entrée invalide.` });
  });

  it("keeps field messages and the form error together", () => {
    const state = searchFormStateFrom([
      { path: "productName", message: "Nom de produit trop court" },
      { path: "", message: "Entrée invalide." },
    ]);

    expect(state).toEqual({ error: "Entrée invalide.", fieldErrors: { productName: "Nom de produit trop court" } });
  });
});
