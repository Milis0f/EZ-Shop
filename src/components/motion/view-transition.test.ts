import { describe, expect, it, vi } from "vitest";
import { browserViewTransitionEnv, viewTransition, type ViewTransitionHandle } from "./view-transition";

/** A stand-in for document.startViewTransition that runs the update as the browser would, later. */
function fakeStart(handle?: Partial<ViewTransitionHandle>) {
  return vi.fn((update: () => Promise<void>): ViewTransitionHandle => {
    const done = Promise.resolve().then(update);
    return {
      updateCallbackDone: handle?.updateCallbackDone ?? done,
      ready: handle?.ready ?? done,
      finished: handle?.finished ?? done,
    };
  });
}

describe("viewTransition", () => {
  it("runs the update right away when the browser has no View Transitions", async () => {
    const update = vi.fn();
    const result = viewTransition(update, { reducedMotion: false });
    expect(update).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toBeUndefined();
  });

  it("skips the transition when the visitor asked for less motion", async () => {
    const start = fakeStart();
    const update = vi.fn();
    await viewTransition(update, { start, reducedMotion: true });
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("hands the update to startViewTransition when motion is allowed", async () => {
    const start = fakeStart();
    const update = vi.fn();
    const result = viewTransition(update, { start, reducedMotion: false });
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    await result;
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("waits for an async update before settling", async () => {
    const order: string[] = [];
    const update = async () => {
      await Promise.resolve();
      order.push("updated");
    };
    await viewTransition(update, { start: fakeStart(), reducedMotion: false });
    order.push("settled");
    expect(order).toEqual(["updated", "settled"]);
  });

  it("reports a failing update through the returned promise, in both paths", async () => {
    const failing = () => {
      throw new Error("boom");
    };
    await expect(viewTransition(failing, { reducedMotion: false })).rejects.toThrow("boom");
    await expect(viewTransition(failing, { start: fakeStart(), reducedMotion: false })).rejects.toThrow("boom");
  });

  it("swallows a skipped transition's ready and finished rejections", async () => {
    const skipped = Promise.reject(new Error("AbortError"));
    const start = fakeStart({ ready: skipped, finished: skipped });
    await expect(viewTransition(vi.fn(), { start, reducedMotion: false })).resolves.toBeUndefined();
  });

  it("falls back to a direct update when startViewTransition throws", async () => {
    const start = vi.fn((): ViewTransitionHandle => {
      throw new Error("InvalidStateError");
    });
    const update = vi.fn();
    await viewTransition(update, { start, reducedMotion: false });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("browserViewTransitionEnv", () => {
  it("offers no transition on the server", () => {
    expect(browserViewTransitionEnv()).toEqual({ reducedMotion: true });
  });
});
