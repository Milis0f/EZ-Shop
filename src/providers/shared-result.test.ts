import { describe, expect, it, vi } from "vitest";
import { fail, ok, type ProviderResult } from "./contracts";
import { sharedResult } from "./shared-result";

/** A promise the test settles by hand, so a load stays in flight exactly as long as needed. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const failure = () => fail<string>("upstream_error", "boom", true);

describe("sharedResult", () => {
  it("shares one load between concurrent callers", async () => {
    const pending = deferred<ProviderResult<string>>();
    const load = vi.fn(() => pending.promise);
    const shared = sharedResult(load);

    const calls = Array.from({ length: 5 }, () => shared.get());
    // While the load is in flight every caller gets the very same promise.
    expect(new Set(calls).size).toBe(1);
    pending.resolve(ok("v"));

    expect(await Promise.all(calls)).toEqual(Array.from({ length: 5 }, () => ok("v")));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after a failure", async () => {
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockResolvedValueOnce(failure()).mockResolvedValueOnce(ok("v"));
    const shared = sharedResult(load);

    expect(await shared.get()).toMatchObject({ ok: false, error: { code: "upstream_error" } });
    expect(await shared.get()).toEqual(ok("v"));
    expect(load).toHaveBeenCalledTimes(2);
    // The success is kept.
    expect(await shared.get()).toEqual(ok("v"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives every concurrent waiter the same failure with one load", async () => {
    const pending = deferred<ProviderResult<string>>();
    const load = vi.fn(() => pending.promise);
    const shared = sharedResult(load);

    const calls = [shared.get(), shared.get(), shared.get()];
    pending.resolve(failure());

    for (const result of await Promise.all(calls)) expect(result).toMatchObject({ ok: false, error: { message: "boom" } });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after a rejected load", async () => {
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(ok("v"));
    const shared = sharedResult(load);

    await expect(shared.get()).rejects.toThrow("network down");
    expect(await shared.get()).toEqual(ok("v"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("rejects every concurrent waiter of a rejected load, with one load", async () => {
    const pending = deferred<ProviderResult<string>>();
    const load = vi.fn(() => pending.promise);
    const shared = sharedResult(load);

    const calls = [shared.get(), shared.get()];
    pending.reject(new Error("network down"));

    for (const settled of await Promise.allSettled(calls)) expect(settled).toMatchObject({ status: "rejected" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps a success until its ttl, then reloads", async () => {
    let clock = 1_000;
    const load = vi.fn(async () => ok({ token: `t${clock}`, ttlMs: 5_000 }));
    const shared = sharedResult(load, { ttlMs: (value) => value.ttlMs, now: () => clock });

    expect(await shared.get()).toEqual(ok({ token: "t1000", ttlMs: 5_000 }));
    clock = 1_000 + 5_000 - 1;
    expect(await shared.get()).toEqual(ok({ token: "t1000", ttlMs: 5_000 }));
    expect(load).toHaveBeenCalledTimes(1);

    clock = 1_000 + 5_000;
    expect(await shared.get()).toEqual(ok({ token: "t6000", ttlMs: 5_000 }));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a success for the life of the instance without a ttl", async () => {
    let clock = 0;
    const load = vi.fn(async () => ok("v"));
    const shared = sharedResult(load, { now: () => clock });

    await shared.get();
    clock = Number.MAX_SAFE_INTEGER;
    expect(await shared.get()).toEqual(ok("v"));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reset forgets the value", async () => {
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockResolvedValueOnce(ok("old")).mockResolvedValueOnce(ok("new"));
    const shared = sharedResult(load);

    expect(await shared.get()).toEqual(ok("old"));
    shared.reset();
    expect(await shared.get()).toEqual(ok("new"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load started before reset never restores its value", async () => {
    const a = deferred<ProviderResult<string>>();
    const b = deferred<ProviderResult<string>>();
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const shared = sharedResult(load);

    const waiterA = shared.get();
    shared.reset();
    const waiterB = shared.get();
    expect(load).toHaveBeenCalledTimes(2);

    // B settles first, A settles last: its answer must not replace the newer value.
    b.resolve(ok("new"));
    expect(await waiterB).toEqual(ok("new"));
    a.resolve(ok("old"));
    expect(await waiterA).toEqual(ok("old"));

    expect(await shared.get()).toEqual(ok("new"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load started before reset never overwrites a newer in-flight load", async () => {
    const a = deferred<ProviderResult<string>>();
    const b = deferred<ProviderResult<string>>();
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const shared = sharedResult(load);

    const waiterA = shared.get();
    shared.reset();
    const waiterB = shared.get();

    a.resolve(ok("old"));
    expect(await waiterA).toEqual(ok("old"));

    // B is still pending: a caller arriving now joins B instead of loading a third time or reading "old".
    const joiner = shared.get();
    expect(joiner).toBe(waiterB);
    b.resolve(ok("new"));
    expect(await joiner).toEqual(ok("new"));
    expect(await shared.get()).toEqual(ok("new"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a load that fails after reset does not clear a newer in-flight load", async () => {
    const a = deferred<ProviderResult<string>>();
    const b = deferred<ProviderResult<string>>();
    const load = vi.fn<() => Promise<ProviderResult<string>>>().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const shared = sharedResult(load);

    const waiterA = shared.get();
    shared.reset();
    const waiterB = shared.get();

    a.reject(new Error("network down"));
    await expect(waiterA).rejects.toThrow("network down");

    expect(shared.get()).toBe(waiterB);
    b.resolve(ok("new"));
    expect(await waiterB).toEqual(ok("new"));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
