import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mockStoredAnalysis } from "@/test/stored-analysis";
import { LegacyMockNotice } from "./legacy-mock-notice";

describe("old mock analyses", () => {
  it("renders an old mock analysis with its banner", async () => {
    const analysis = await mockStoredAnalysis(["FR"]);
    expect(analysis.dataMode).toBe("mock");

    const html = renderToStaticMarkup(createElement(LegacyMockNotice, { dataMode: analysis.dataMode }));
    expect(html).toContain("Analyse fictive ancienne, créée avant la V1 : ses chiffres ne sont pas réels.");
    expect(html).toContain('role="status"');
  });

  it("shows nothing on a live analysis", () => {
    expect(renderToStaticMarkup(createElement(LegacyMockNotice, { dataMode: "live" }))).toBe("");
  });
});
