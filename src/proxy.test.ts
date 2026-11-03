import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const request = (host: string, init: { method?: string; origin?: string } = {}) =>
  new NextRequest(`http://${host}/api/analyses`, {
    method: init.method ?? "GET",
    headers: { host, ...(init.origin && { origin: init.origin }) },
  });

describe("proxy", () => {
  it("passes a request of this computer on to the app", () => {
    const response = proxy(request("localhost:3001"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("answers 403 to a request addressed to another name", async () => {
    const response = proxy(request("192.168.1.191:3001"));
    expect(response.status).toBe(403);
    expect(await response.text()).toContain("http://localhost");
  });

  it("answers 403 to a change sent from another site", () => {
    expect(proxy(request("localhost:3001", { method: "POST", origin: "https://evil.example" })).status).toBe(403);
  });
});
