import type { Assumption, AssumptionKey, AssumptionSet, Distribution } from "@/domain/assumption";

/**
 * DEFAULT ASSUMPTIONS — hypotheses, NOT observed data.
 * They are conventional starting ranges for a new store with no history.
 * The UI always lists them; users can override them per analysis.
 * Replace them as soon as real benchmarks are available for the category.
 */

const DEFAULTS: AssumptionSet = {
  traffic_capture_share: {
    key: "traffic_capture_share",
    label: "Part de la demande captée",
    description:
      "Part des recherches mensuelles du pays transformées en visites sur la boutique (payant + organique).",
    unit: "ratio",
    distribution: { type: "triangular", min: 0.002, mode: 0.01, max: 0.03 },
    origin: "default",
    rationale: "Hypothèse prudente pour une boutique neuve sans notoriété ni SEO. Non observée.",
  },
  conversion_rate: {
    key: "conversion_rate",
    label: "Taux de conversion visite → commande",
    description: "Proportion des visites qui aboutissent à une commande.",
    unit: "ratio",
    distribution: { type: "triangular", min: 0.005, mode: 0.015, max: 0.03 },
    origin: "default",
    rationale: "Plage conventionnelle e-commerce généraliste. Non observée pour ce produit.",
  },
  social_ctr: {
    key: "social_ctr",
    label: "CTR publicités sociales",
    description: "Taux de clic utilisé pour convertir un CPM Meta/TikTok en CPC.",
    unit: "ratio",
    distribution: { type: "triangular", min: 0.005, mode: 0.01, max: 0.02 },
    origin: "default",
    rationale: "Plage conventionnelle pour des campagnes de conversion. Non observée.",
  },
  test_target_conversions: {
    key: "test_target_conversions",
    label: "Conversions visées pour un test",
    description: "Nombre de commandes à obtenir pour juger un test publicitaire.",
    unit: "orders",
    distribution: { type: "fixed", value: 15 },
    origin: "default",
    rationale: "Seuil de décision choisi par convention, modifiable.",
  },
};

export function buildAssumptions(
  overrides: Partial<Record<AssumptionKey, Distribution>> = {},
): AssumptionSet {
  const entries = Object.values(DEFAULTS).map((base): [AssumptionKey, Assumption] => {
    const override = overrides[base.key];
    return [
      base.key,
      override
        ? { ...base, distribution: override, origin: "user", rationale: "Valeur saisie par l'utilisateur." }
        : base,
    ];
  });
  return Object.fromEntries(entries) as AssumptionSet;
}
