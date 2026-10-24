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

  it("keeps field messages and the form error together", () => {
    const state = searchFormStateFrom([
      { path: "productName", message: "Nom de produit trop court" },
      { path: "", message: "Entrée invalide." },
    ]);

    expect(state).toEqual({ error: "Entrée invalide.", fieldErrors: { productName: "Nom de produit trop court" } });
  });
});
