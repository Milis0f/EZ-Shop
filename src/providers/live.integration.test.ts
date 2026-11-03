import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryCacheRepository } from "@/server/repositories/memory-repositories";
import { probeFor, runProbe, type HealthResult } from "./health-probes";
import { createProviderSet, REAL_PROVIDER_METAS } from "./registry";

/**
 * Real network check of every source, run by hand only: `EZ_LIVE=1 npm test -- live.integration`.
 * The same probes as the page's "Test now": one minimal read per source, nothing created or changed.
 * Keys come from .env.local and are never printed: only the source, the outcome, its code and time.
 * CI never runs it: a provider's availability is not a test of this code.
 */

const LIVE = process.env.EZ_LIVE === "1";

function localEnv(): Record<string, string> {
  try {
    const text = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2].trim()]),
    );
  } catch {
    return {};
  }
}

describe.runIf(LIVE)("every source, for real", { timeout: 300_000 }, () => {
  it("answers its probe", async () => {
    const { getEnv } = await import("@/config/env");
    const previous = { ...process.env };
    Object.assign(process.env, localEnv(), { NODE_ENV: "test" });
    const env = getEnv();
    process.env = previous;

    const set = createProviderSet({ env, cache: new MemoryCacheRepository() });
    const results: HealthResult[] = [];
    for (const meta of REAL_PROVIDER_METAS) {
      const probe = probeFor(set, meta.id);
      if (probe) results.push(await runProbe(meta.id, probe));
    }
    console.log(`\nLIVE RESULTS ${new Date().toISOString()}\n${results.map((r) => `${r.outcome.padEnd(6)} ${r.id.padEnd(30)} ${String(r.ms).padStart(6)} ms  ${r.code ?? ""}`).join("\n")}\n`);
    expect(results).toHaveLength(REAL_PROVIDER_METAS.length);
  });
});
