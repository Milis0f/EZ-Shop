import { describe, expect, it } from "vitest";
import { describeStorageError, parseJsonForStorage, toStorageSafeText, UnsafeJsonKeysError } from "./storage-safe";

describe("toStorageSafeText", () => {
  it("removes NUL and replaces lone surrogates", () => {
    expect(toStorageSafeText("a\u0000b\ud800c")).toBe("ab�c");
    expect(toStorageSafeText("\udc00")).toBe("�");
  });

  it("leaves well-formed text untouched", () => {
    expect(toStorageSafeText("é ❄️ 日本語 \u{1f600}")).toBe("é ❄️ 日本語 \u{1f600}");
    expect(toStorageSafeText("")).toBe("");
  });
});

describe("parseJsonForStorage", () => {
  it("sanitises values and keys while parsing JSON", () => {
    expect(parseJsonForStorage('{"t":"a\\u0000b","\\u0000k":["\\ud800"]}')).toEqual({ t: "ab", k: ["�"] });
  });

  it("sanitises nested objects, array elements and top-level strings", () => {
    expect(parseJsonForStorage('{"a":{"b\\u0000":[{"c":"x\\u0000"},"y\\u0000",1,null,true]}}')).toEqual({
      a: { b: [{ c: "x" }, "y", 1, null, true] },
    });
    expect(parseJsonForStorage('"a\\u0000b"')).toBe("ab");
    expect(parseJsonForStorage("42")).toBe(42);
    expect(parseJsonForStorage("null")).toBeNull();
  });

  it("returns the same data as JSON.parse when nothing needs sanitising", () => {
    const text = JSON.stringify({ a: [1, 2, { b: "é" }], c: null, d: "x", e: false });
    expect(parseJsonForStorage(text)).toEqual(JSON.parse(text));
  });

  it("still rejects text that is not JSON", () => {
    expect(() => parseJsonForStorage("<html>")).toThrow(SyntaxError);
    expect(() => parseJsonForStorage("")).toThrow(SyntaxError);
  });

  it("refuses keys that collide once sanitised", () => {
    expect(() => parseJsonForStorage('{"a\\u0000":1,"a":2}')).toThrow(UnsafeJsonKeysError);
    expect(() => parseJsonForStorage('{"a":1,"a\\u0000":2}')).toThrow(UnsafeJsonKeysError);
    expect(() => parseJsonForStorage('{"\\ud800":1,"\\ufffd":2}')).toThrow(UnsafeJsonKeysError);
    // Nested in objects and arrays.
    expect(() => parseJsonForStorage('{"outer":{"a\\u0000":1,"a":2}}')).toThrow(UnsafeJsonKeysError);
    expect(() => parseJsonForStorage('[{"a\\u0000":1,"a":2}]')).toThrow(UnsafeJsonKeysError);
  });

  it("does not echo keys or values in the collision error", () => {
    let thrown: unknown;
    try {
      parseJsonForStorage('{"secret-key-77\\u0000":"secret-value-88","secret-key-77":"other"}');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnsafeJsonKeysError);
    const text = `${(thrown as Error).name} ${(thrown as Error).message}`;
    expect(text).not.toContain("secret-key-77");
    expect(text).not.toContain("secret-value-88");
  });

  it("accepts the same key text in different objects", () => {
    expect(parseJsonForStorage('[{"a\\u0000":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("keeps __proto__ as plain data", () => {
    const parsed = parseJsonForStorage('{"__proto__":{"polluted":true},"x\\u0000":1}') as Record<string, unknown>;
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parsed.x).toBe(1);
    expect(Object.getOwnPropertyDescriptor(parsed, "__proto__")?.value).toEqual({ polluted: true });
  });

  it("keeps __proto__ own when it is the key that gets sanitised", () => {
    const parsed = parseJsonForStorage('{"__proto__\\u0000":{"polluted":true}}') as Record<string, unknown>;
    expect(Object.hasOwn(parsed, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("refuses a __proto__ key that collides once sanitised", () => {
    expect(() => parseJsonForStorage('{"__proto__\\u0000":1,"__proto__":2}')).toThrow(UnsafeJsonKeysError);
  });
});

describe("describeStorageError", () => {
  it("describes storage errors without their message", () => {
    const error = Object.assign(new Error("token SECRET-TOKEN-123 in payload"), { code: "22P05" });
    expect(describeStorageError(error)).toBe("Error (code 22P05)");
  });

  it("reads the SQLSTATE one level down, as Drizzle wraps driver errors", () => {
    const driver = Object.assign(new Error("unsupported Unicode escape sequence: SECRET-TOKEN-123"), { name: "error", code: "22P05" });
    const wrapped = new Error(`Failed query: insert into provider_cache values ($1)\nparams: SECRET-TOKEN-123`, { cause: driver });
    expect(describeStorageError(wrapped)).toBe("Error (code 22P05)");
    expect(describeStorageError(driver)).toBe("error (code 22P05)");
  });

  it("looks one level down only", () => {
    const deep = new Error("deep", { cause: Object.assign(new Error("inner"), { code: "22P05" }) });
    expect(describeStorageError(new Error("top", { cause: deep }))).toBe("Error");
  });

  it("leaves out a code that is not a SQLSTATE", () => {
    expect(describeStorageError(Object.assign(new Error("m"), { code: "x; drop" }))).toBe("Error");
    expect(describeStorageError(Object.assign(new Error("m"), { code: "22p05" }))).toBe("Error");
    expect(describeStorageError(Object.assign(new Error("m"), { code: "ECONNREFUSED" }))).toBe("Error");
    expect(describeStorageError(Object.assign(new Error("m"), { code: 22005 }))).toBe("Error");
    expect(describeStorageError(new Error("m", { cause: Object.assign(new Error("c"), { code: "x; drop" }) }))).toBe("Error");
  });

  it("falls back to a generic name when the name is not an identifier", () => {
    const error = Object.assign(new Error("m"), { name: "Bad name; drop table", code: "23505" });
    expect(describeStorageError(error)).toBe("error (code 23505)");
    expect(describeStorageError(Object.assign(new Error("m"), { name: "A".repeat(41) }))).toBe("error");
    expect(describeStorageError(Object.assign(new Error("m"), { name: "" }))).toBe("error");
  });

  it("gives a generic text for values that are not errors", () => {
    expect(describeStorageError("token SECRET-TOKEN-123")).toBe("unknown error");
    expect(describeStorageError(undefined)).toBe("unknown error");
    expect(describeStorageError(null)).toBe("unknown error");
    expect(describeStorageError({ name: "Error", code: "22P05", message: "SECRET-TOKEN-123" })).toBe("unknown error");
  });
});
