import { describe, expect, it, vi } from "vitest";
import type { StoreTraffic } from "@/domain/store";
import type { EngineLoadResult } from "@/server/ai/types";
import { reviewStore } from "./review";
import { reviewFacts, type ReviewMaterial } from "./review-facts";

const traffic: StoreTraffic = {
  since: "2026-10-03",
  until: "2026-11-02",
  totals: { sessions: 200, visitors: 150, carts: 20, checkouts: 8, purchases: 4, pageviews: 600, bounces: 90, averageSeconds: 75 },
  botSessions: 12,
  byDay: [],
  byCountry: [{ key: "FR", sessions: 120, visitors: 100, carts: 12, checkouts: 5, purchases: 3 }],
  bySource: [{ type: "paid", name: "Facebook", sessions: 50, visitors: 45, carts: 5, checkouts: 2, purchases: 1 }],
  byDevice: [{ key: "mobile", sessions: 140, visitors: 100, carts: 10, checkouts: 4, purchases: 2 }],
  byLanding: [],
  readAt: "2026-11-02T12:00:00Z",
};

const material: ReviewMaterial = { snapshot: null, summary: null, traffic, meta: null, google: null };
const NOW = new Date("2026-11-02T12:00:00Z");

const answer = (extra: Record<string, unknown> = {}) => ({
  headline: "200 visites mais seulement 4 achats : le panier est le point faible.",
  strengths: ["Les téléphones font 140 visites."],
  problems: ["Seulement 2% des visites achètent."],
  actions: [{ title: "Simplifie la page produit", why: "20 visites ajoutent au panier, 4 achètent.", priority: "high", area: "conversion" }],
  ...extra,
});

function engine(...answers: unknown[]): { deps: { loadEngine: () => Promise<EngineLoadResult>; now: () => Date }; calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn();
  let i = 0;
  const completeJson = async (request: unknown) => {
    calls(request);
    return answers[Math.min(i++, answers.length - 1)];
  };
  return { calls, deps: { loadEngine: async () => ({ ok: true, engine: { model: { name: "Fake 1B", license: "MIT" }, completeJson } }), now: () => NOW } };
}

describe("the fact sheet", () => {
  it("states the visits with their rates and names what is missing", () => {
    const facts = reviewFacts(material);
    expect(facts).toContain("visits 200");
    expect(facts).toContain("conversion 2%");
    expect(facts).toContain("repeat visits 50");
    expect(facts).toContain("Paid visits recognised: Google 0, Meta 50");
    expect(facts).toContain("Not available: sales, Meta Ads, Google Ads.");
  });
});

describe("the AI's review of the store", () => {
  it("needs the sales or the visits", async () => {
    const { deps } = engine(answer());
    expect(await reviewStore({ ...material, traffic: null }, "fr", deps)).toEqual({ ok: false, code: "no_store" });
  });

  it("says when the AI is off or missing", async () => {
    const off = { loadEngine: async (): Promise<EngineLoadResult> => ({ ok: false, reason: "off", failure: { code: "disabled" } }), now: () => NOW };
    expect(await reviewStore(material, "fr", off)).toEqual({ ok: false, code: "ai_off" });
    const missing = { loadEngine: async (): Promise<EngineLoadResult> => ({ ok: false, reason: "x", failure: { code: "model_missing", file: "m.gguf" } }), now: () => NOW };
    expect(await reviewStore(material, "fr", missing)).toEqual({ ok: false, code: "ai_missing" });
  });

  it("keeps an answer whose numbers are all on the sheet", async () => {
    const { deps, calls } = engine(answer());
    const result = await reviewStore(material, "fr", deps);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, review: { model: "Fake 1B", writtenAt: NOW.toISOString(), used: { sales: false, traffic: true, meta: false, google: false } } });
    if (result.ok) expect(result.review.actions[0]).toMatchObject({ priority: "high", area: "conversion" });
  });

  it("asks again when a number is not on the sheet, naming it", async () => {
    const { deps, calls } = engine(answer({ headline: "Tu pourrais faire 350 visites." }), answer());
    const result = await reviewStore(material, "fr", deps);
    expect(result.ok).toBe(true);
    expect(calls).toHaveBeenCalledTimes(2);
    expect((calls.mock.calls[1]?.[0] as { user: string }).user).toContain("350");
  });

  it("drops only the sentences with invented numbers after the second try", async () => {
    const wrong = answer({ strengths: ["Tu as 999 fans."], actions: [{ title: "Vise 77 ventes", why: "x", priority: "low", area: "ads" }, { title: "Ajoute des avis clients", why: "Seulement 4 achats sur 200 visites.", priority: "medium", area: "conversion" }] });
    const { deps } = engine(wrong, wrong);
    const result = await reviewStore(material, "fr", deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.strengths).toEqual([]);
    expect(result.review.actions.map((a) => a.title)).toEqual(["Ajoute des avis clients"]);
  });

  it("shows nothing when every piece of advice was invented", async () => {
    const invented = answer({ problems: ["Tu perds 999 ventes."], actions: [{ title: "Vise 77 ventes", why: "x", priority: "low", area: "ads" }] });
    const { deps } = engine(invented, invented);
    expect(await reviewStore(material, "fr", deps)).toEqual({ ok: false, code: "ai_rejected" });
  });
});
