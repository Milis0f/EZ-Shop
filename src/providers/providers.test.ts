import { describe, expect, it } from "vitest";
import type { SourceRef } from "@/domain/provenance";
import { aggregateAds, weekStart } from "./ad-activity";
import { parseEurostat } from "./eurostat/adapter";
import { parseHistoricalMetrics } from "./google-ads/parse";
import { parseOecdGenericXml } from "./oecd/adapter";
import { parseWorldBank } from "./world-bank/adapter";

const AT = "2026-10-14T12:00:00.000Z";

describe("World Bank parser (payload recorded 2026-10-14)", () => {
  const payload = [
    { page: 1, pages: 1, per_page: 100, total: 3, sourceid: null, lastupdated: "2026-10-08" },
    [
      { indicator: { id: "NY.GDP.PCAP.PP.CD", value: "GDP per capita, PPP" }, country: { id: "DE", value: "Germany" }, countryiso3code: "DEU", date: "2025", value: 75406.6888111618, obs_status: "", decimal: 1 },
      { indicator: { id: "NY.GDP.PCAP.PP.CD", value: "GDP per capita, PPP" }, country: { id: "FR", value: "France" }, countryiso3code: "FRA", date: "2025", value: 63975.353585864, obs_status: "", decimal: 1 },
      { indicator: { id: "NY.GDP.PCAP.PP.CD", value: "GDP per capita, PPP" }, country: { id: "ZZ", value: "Unknown" }, countryiso3code: "ZZZ", date: "2025", value: 1, obs_status: "", decimal: 1 },
      { indicator: { id: "NY.GDP.PCAP.PP.CD", value: "GDP per capita, PPP" }, country: { id: "US", value: "United States" }, countryiso3code: "USA", date: "2025", value: null, obs_status: "", decimal: 1 },
    ],
  ];

  it("keeps supported countries with a value and records provenance", () => {
    const result = parseWorldBank(payload, "gdp_per_capita_ppp", "https://api.worldbank.org/x", AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.map((o) => o.country)).toEqual(["DE", "FR"]);
    expect(result.data[1].source).toMatchObject({ sourceId: "world-bank", origin: "live", period: { start: "2025", end: "2025" } });
  });

  it("treats an empty page as no data, not an error", () => {
    const empty = [{ page: 0, pages: 0, per_page: 0, total: 0, sourceid: null, lastupdated: null }, null];
    expect(parseWorldBank(empty, "population", "u", AT)).toEqual({ ok: true, data: [] });
  });

  it("rejects unexpected shapes", () => {
    expect(parseWorldBank({ foo: 1 }, "population", "u", AT).ok).toBe(false);
  });
});

describe("Eurostat JSON-stat parser", () => {
  // Shape of isoc_ec_ib20 filtered to one indicator (recorded 2026-10-14, values trimmed).
  const payload = {
    id: ["freq", "ind_type", "indic_is", "unit", "geo", "time"],
    size: [1, 1, 1, 1, 3, 2],
    value: { "0": 76.93, "1": 80.15, "2": 83.42, "4": 77.48 },
    dimension: {
      freq: { category: { index: { A: 0 } } },
      ind_type: { category: { index: { IND_TOTAL: 0 } } },
      indic_is: { category: { index: { I_BLT12: 0 } } },
      unit: { category: { index: { PC_IND: 0 } } },
      geo: { category: { index: { FR: 0, CH: 1, DE: 2 } } },
      time: { category: { index: { "2024": 0, "2025": 1 } } },
    },
  };

  it("picks the latest available year per country", () => {
    const result = parseEurostat(payload, ["FR", "CH", "DE", "GB"], "u", AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byCountry = Object.fromEntries(result.data.map((o) => [o.country, [o.value, o.source.period?.end]]));
    expect(byCountry).toEqual({ FR: [80.15, "2025"], CH: [83.42, "2024"], DE: [77.48, "2024"] });
  });
});

describe("OECD SDMX-ML parser", () => {
  const series = (area: string, obs: Array<[string, string]>) =>
    `<generic:Series><generic:SeriesKey><generic:Value id="REF_AREA" value="${area}" /><generic:Value id="FREQ" value="M" /></generic:SeriesKey>` +
    obs.map(([p, v]) => `<generic:Obs><generic:ObsDimension id="TIME_PERIOD" value="${p}" /><generic:ObsValue value="${v}" /></generic:Obs>`).join("") +
    `</generic:Series>`;
  const xml = `<?xml version="1.0"?><message:GenericData>${series("FRA", [["2026-08", "97.77796"]])}${series("FRA", [["2026-09", "97.75892"], ["2026-06", "97.40392"]])}${series("XXX", [["2026-09", "1"]])}</message:GenericData>`;

  it("merges fragmented series and keeps the latest observation", () => {
    const result = parseOecdGenericXml(xml, "u", AT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ country: "FR", value: 97.75892, source: { period: { end: "2026-09" } } });
  });

  it("rejects non SDMX payloads", () => {
    expect(parseOecdGenericXml("Internal server error", "u", AT).ok).toBe(false);
  });
});

describe("Google Ads historical metrics parser (shape from the REST reference)", () => {
  const source: SourceRef = { sourceId: "google-ads-keyword-planner", origin: "live", collectedAt: AT, connectorVersion: "t" };

  it("converts int64 strings and bid micros", () => {
    const payload = {
      results: [
        {
          text: "chaussettes",
          keywordMetrics: {
            avgMonthlySearches: "12100",
            competitionIndex: "37",
            lowTopOfPageBidMicros: "250000",
            highTopOfPageBidMicros: "910000",
            monthlySearchVolumes: [
              { month: "FEBRUARY", year: "2026", monthlySearches: "9900" },
              { month: "JANUARY", year: "2026", monthlySearches: "14800" },
            ],
          },
        },
      ],
    };
    const result = parseHistoricalMetrics(payload, "EUR", source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({ avgMonthlySearches: 12100, competitionIndex: 37, lowTopOfPageBid: 0.25, highTopOfPageBid: 0.91 });
    expect(result.data[0].monthlyVolumes).toEqual([{ month: "2026-01", value: 14800 }, { month: "2026-02", value: 9900 }]);
  });

  it("fails loudly on an unknown shape instead of guessing", () => {
    expect(parseHistoricalMetrics({ results: [{ text: 1 }] }, "EUR", source).ok).toBe(false);
  });
});

describe("ad activity aggregation", () => {
  it("computes Monday week starts", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("counts active ads, unique advertisers and weekly launches with zero-filled gaps", () => {
    const result = aggregateAds(
      [
        { id: "1", advertiserId: "a", startDate: "2026-09-01" },
        { id: "1", advertiserId: "a", startDate: "2026-09-01" },
        { id: "2", advertiserId: "a", startDate: "2026-09-02", stopDate: "2026-09-10" },
        { id: "3", advertiserId: "b", startDate: "2026-09-20" },
      ],
      "2026-10-14",
      "2026-09-01",
    );
    expect(result.activeAds).toBe(2);
    expect(result.uniqueAdvertisers).toBe(2);
    expect(result.newAdsByWeek[0]).toEqual({ weekStart: "2026-08-31", count: 2 });
    expect(result.newAdsByWeek.some((w) => w.count === 0)).toBe(true);
  });
});
