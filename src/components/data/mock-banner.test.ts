import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { mockStoredAnalysis } from "@/test/stored-analysis";
import { LegacyMockNotice } from "./legacy-mock-notice";

const render = (dataMode: "mock" | "live", locale: Locale) =>
  renderToStaticMarkup(createElement(LocaleProvider, { locale } as { locale: Locale; children: ReactNode }, createElement(LegacyMockNotice, { dataMode })));

describe("old mock analyses", () => {
  it("renders an old mock analysis with its banner, in the active language", async () => {
    const analysis = await mockStoredAnalysis(["FR"]);
    expect(analysis.dataMode).toBe("mock");

    for (const locale of ["en", "fr", "es"] as const) {
      const html = render(analysis.dataMode, locale);
      expect(html).toContain(messagesFor("analysisAdvanced", locale).data.legacyMock);
      expect(html).toContain('role="status"');
    }
  });

  it("shows nothing on a live analysis", () => {
    expect(render("live", "en")).toBe("");
  });
});
