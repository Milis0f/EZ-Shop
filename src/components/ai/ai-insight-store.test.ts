import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AI_INSIGHT_METHOD } from "@/domain/ai-insight";
import { getInsightView, resetInsightStore, retryInsight, subscribeInsight } from "./ai-insight-store";
import { countryName, groupCountryLines, lowerFirst } from "./ai-reading";

const ID = "0f8e6a52-3c1d-4f5e-9a7b-2d4c6e8f0a1b";

const ready = {
  status: "ready",
  method: AI_INSIGHT_METHOD,
  insight: {
    summary: "Résumé.",
    countries: [{ country: "FR", sentence: "Données insuffisantes." }],
    nextSteps: ["Connecter eBay."],
    productReading: { category: "Textile", description: "un vêtement." },
  },
  model: { name: "Fake model", license: "Apache-2.0" },
  generatedAt: "2026-10-27T10:00:00.000Z",
  durationMs: 12,
  cached: false,
};

const okResponse = () => new Response(JSON.stringify({ success: true, data: ready, error: null }), { status: 200 });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  resetInsightStore();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("insight store", () => {
  it("shares one request between the simple and advanced views", async () => {
    fetchMock.mockImplementation(async () => okResponse());
    const simple = vi.fn();
    const advanced = vi.fn();

    subscribeInsight(ID, "en", simple);
    subscribeInsight(ID, "en", advanced);
    await vi.waitFor(() => expect(getInsightView(ID, "en").kind).toBe("ready"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(simple).toHaveBeenCalled();
    expect(advanced).toHaveBeenCalled();
    const view = getInsightView(ID, "en");
    expect(view.kind === "ready" && view.result.missingCountries).toEqual([]);
  });

  it("retries for both views at once after an error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline")).mockImplementation(async () => okResponse());
    const simple = vi.fn();
    const advanced = vi.fn();
    subscribeInsight(ID, "en", simple);
    subscribeInsight(ID, "en", advanced);
    await vi.waitFor(() => expect(getInsightView(ID, "en")).toEqual({ kind: "error", error: { code: "network" } }));

    retryInsight(ID, "en");
    expect(getInsightView(ID, "en").kind).toBe("thinking");
    await vi.waitFor(() => expect(getInsightView(ID, "en").kind).toBe("ready"));

    // One store entry: whichever view is shown, it reads the same ready state.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(advanced.mock.calls.length).toBe(simple.mock.calls.length);
  });

  it("aborts the request once nobody listens, and starts again on the next view", async () => {
    let seen: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    const unsubscribe = subscribeInsight(ID, "en", () => undefined);
    unsubscribe();
    await flush();

    expect(seen?.aborted).toBe(true);
    expect(getInsightView(ID, "en").kind).toBe("thinking");
    subscribeInsight(ID, "en", () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows the server's message for an HTTP error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, data: null, error: { message: "Trop de demandes à l'IA, réessaie plus tard." } }), { status: 429 }));

    subscribeInsight(ID, "en", () => undefined);

    await vi.waitFor(() => expect(getInsightView(ID, "en")).toEqual({ kind: "error", error: { code: "server", message: "Trop de demandes à l'IA, réessaie plus tard." } }));
  });
});

describe("insight store by language", () => {
  it("asks again after a language switch, and keeps each language's reading apart", async () => {
    fetchMock.mockImplementation(async () => okResponse());

    subscribeInsight(ID, "en", () => undefined);
    await vi.waitFor(() => expect(getInsightView(ID, "en").kind).toBe("ready"));
    subscribeInsight(ID, "fr", () => undefined);

    expect(getInsightView(ID, "fr").kind).toBe("thinking");
    await vi.waitFor(() => expect(getInsightView(ID, "fr").kind).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an HTTP error without a message by its status", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 502 }));

    subscribeInsight(ID, "es", () => undefined);

    await vi.waitFor(() => expect(getInsightView(ID, "es")).toEqual({ kind: "error", error: { code: "http", status: 502 } }));
  });
});

describe("reading helpers", () => {
  it("writes countries with the same sentence once, in order", () => {
    const groups = groupCountryLines([
      { country: "FR", sentence: "Confiance de 9 sur 100." },
      { country: "ES", sentence: "Aucune donnée." },
      { country: "LU", sentence: "confiance de 9  sur 100. " },
      { country: "IT", sentence: "Aucune donnée." },
    ]);

    expect(groups).toEqual([
      { countries: ["FR", "LU"], sentence: "Confiance de 9 sur 100." },
      { countries: ["ES", "IT"], sentence: "Aucune donnée." },
    ]);
  });

  it("lowercases the first letter after a colon, but not an acronym", () => {
    expect(lowerFirst("C'est un accessoire.")).toBe("c'est un accessoire.");
    expect(lowerFirst("LED de bureau.")).toBe("LED de bureau.");
    expect(lowerFirst("")).toBe("");
  });

  it("names countries in the interface language", () => {
    expect(countryName("DE", "fr")).toBe("Allemagne");
    expect(countryName("DE", "en")).toBe("Germany");
    expect(countryName("DE", "es")).toBe("Alemania");
    expect(countryName("GB", "es")).toBe("Reino Unido");
  });
});
