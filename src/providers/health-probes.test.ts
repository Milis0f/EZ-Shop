import { describe, expect, it } from "vitest";
import type { ServerEnv } from "@/config/env";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { accessClass, fail, ok } from "./contracts";
import { probeFor, runProbe } from "./health-probes";
import { createProviderSet, REAL_PROVIDER_METAS } from "./registry";

const env = { NODE_ENV: "test", PGLITE_DATA_DIR: ".data/test", PROVIDER_HTTP_TIMEOUT_MS: 1000 } as ServerEnv;

describe("health probes", () => {
  it("gives every connector of the registry a probe", () => {
    const set = createProviderSet({ env, cache: new MemoryCacheRepository() });
    expect(REAL_PROVIDER_METAS.filter((m) => probeFor(set, m.id) === null).map((m) => m.id)).toEqual([]);
  });

  it("tells data, a valid empty answer and a failure apart, and keeps only the error code", async () => {
    expect(await runProbe("eurostat", { run: async () => ok({ FR: 1 }), hasData: () => true })).toMatchObject({ outcome: "ok", code: null });
    expect(await runProbe("eurostat", { run: async () => ok([]), hasData: () => false })).toMatchObject({ outcome: "empty", code: null });
    const failed = await runProbe("eurostat", { run: async () => fail("unauthorized", "Google Ads: HTTP 403 with SECRET in it"), hasData: () => true });
    expect(failed).toMatchObject({ outcome: "failed", code: "unauthorized" });
    expect(JSON.stringify(failed)).not.toContain("SECRET");
    expect(await runProbe("eurostat", { run: async () => Promise.reject(new Error("boom")), hasData: () => true })).toMatchObject({ outcome: "failed", code: "threw" });
  });
});

describe("access class", () => {
  it("is derived, never declared: open sources are automatic, keyed ones advanced, unbuilt ones not qualified", () => {
    const of = (id: string) => accessClass(REAL_PROVIDER_METAS.find((m) => m.id === id)!);
    expect(of("eurostat")).toBe("automatic");
    expect(of("google-ads-keyword-planner")).toBe("advanced");
    expect(of("google-trends")).toBe("not_qualified");
    expect(of("meta-marketing-api")).toBe("not_qualified");
    // No source has an official one-click sign-in with a public client yet.
    expect(REAL_PROVIDER_METAS.map(accessClass)).not.toContain("one_click");
  });

  it("states maturity and a checked date for every connector; stable ones were checked for real", () => {
    for (const meta of REAL_PROVIDER_METAS) {
      expect(["stable", "beta", "experimental", "deprecated", "disabled"]).toContain(meta.maturity);
      if (meta.maturity === "stable") expect(meta.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
