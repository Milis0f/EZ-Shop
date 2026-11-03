import { describe, expect, it } from "vitest";
import type { FieldState } from "@/config/connector-fields";
import { sourceStatus } from "./source-status";

const set = (name: string): FieldState => ({ name, optional: false, set: true });
const unset = (name: string): FieldState => ({ name, optional: false, set: false });

describe("the status a source is shown with", () => {
  it("never calls a keyed source ready because its keys are there: it is configured, not tested", () => {
    expect(sourceStatus("ready", [set("YOUTUBE_API_KEY")], "account", null)).toBe("untested");
    expect(sourceStatus("ready", [set("META_AD_LIBRARY_ACCESS_TOKEN")], "approval", null)).toBe("untested");
  });

  it("calls it ready once a real test answered, and failing when the last one did not", () => {
    expect(sourceStatus("ready", [set("YOUTUBE_API_KEY")], "account", "ok")).toBe("ready");
    expect(sourceStatus("ready", [set("YOUTUBE_API_KEY")], "account", "empty")).toBe("ready");
    // Google Ads with valid OAuth but no Basic access: refused for real.
    expect(sourceStatus("ready", [set("GOOGLE_ADS_REFRESH_TOKEN")], "account", "failed")).toBe("failing");
  });

  it("keeps an open source ready without a local test, unless its last test failed", () => {
    expect(sourceStatus("ready", [], "open", null)).toBe("ready");
    expect(sourceStatus("ready", [], "open", "failed")).toBe("failing");
  });

  it("keeps the other states as they were", () => {
    expect(sourceStatus("not_configured", [set("EBAY_CLIENT_ID"), unset("EBAY_CLIENT_SECRET")], "account")).toBe("repair");
    expect(sourceStatus("not_configured", [unset("EBAY_CLIENT_ID")], "account")).toBe("not_configured");
    expect(sourceStatus("not_implemented", [], "approval")).toBe("not_implemented");
    expect(sourceStatus("mock", [], "open")).toBe("not_configured");
  });
});
