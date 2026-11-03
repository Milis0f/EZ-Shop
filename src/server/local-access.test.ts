import { describe, expect, it } from "vitest";
import { checkLocalAccess } from "./local-access";

const HOST = "localhost:3001";
const check = (headers: Record<string, string>, method = "GET") => checkLocalAccess(new Headers(headers), method);

describe("checkLocalAccess", () => {
  it.each(["localhost:3001", "127.0.0.1:3001", "[::1]:3001", "localhost", "app.localhost:3001"])("lets a page of this machine through (%s)", (host) => {
    expect(check({ host })).toEqual({ ok: true });
  });

  it.each([
    ["a device of the network", "192.168.1.191:3001"],
    ["a rebinding site", "evil.example:3001"],
    ["a name that only starts like localhost", "localhost.evil.example:3001"],
    ["no Host at all", ""],
  ])("refuses %s, whatever the method", (_, host) => {
    expect(check(host ? { host } : {})).toEqual({ ok: false, reason: "host" });
    expect(check(host ? { host } : {}, "POST")).toEqual({ ok: false, reason: "host" });
  });

  it("refuses a forwarded host that is not this machine", () => {
    expect(check({ host: HOST, "x-forwarded-host": "evil.example" })).toEqual({ ok: false, reason: "forwarded_host" });
    expect(check({ host: HOST, "x-forwarded-host": `${HOST}, evil.example` })).toEqual({ ok: false, reason: "forwarded_host" });
    expect(check({ host: HOST, "x-forwarded-host": HOST })).toEqual({ ok: true });
  });

  it("lets a change through from this origin, or from no browser page", () => {
    expect(check({ host: HOST, origin: `http://${HOST}` }, "POST")).toEqual({ ok: true });
    expect(check({ host: HOST, origin: "HTTP://LOCALHOST:3001" }, "post")).toEqual({ ok: true });
    expect(check({ host: HOST }, "DELETE")).toEqual({ ok: true });
  });

  it.each([
    ["another site", "https://evil.example"],
    ["another local app on another port", "http://localhost:3000"],
    ["a sandboxed page", "null"],
    ["a malformed origin", "http://localhost:3001/path"],
  ])("refuses a change sent by %s", (_, origin) => {
    expect(check({ host: HOST, origin }, "POST")).toEqual({ ok: false, reason: "origin" });
  });

  it("leaves reads alone: the browser keeps another site from reading the answer", () => {
    expect(check({ host: HOST, origin: "https://evil.example" }, "GET")).toEqual({ ok: true });
  });
});
