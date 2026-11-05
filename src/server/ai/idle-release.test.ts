import { describe, expect, it } from "vitest";
import { createSerialQueue, IDLE_RELEASE_MS, shouldRelease } from "./engine";

describe("freeing the model when the AI is not used", () => {
  it("frees it only once nothing runs and nothing ran for the idle time", () => {
    expect(shouldRelease(0, 0, IDLE_RELEASE_MS)).toBe(true);
    expect(shouldRelease(0, 0, IDLE_RELEASE_MS - 1)).toBe(false);
    expect(shouldRelease(1, 0, IDLE_RELEASE_MS * 10)).toBe(false);
  });

  it("counts the generations still queued or running, and when the last one ended", async () => {
    let now = 1_000;
    const queue = createSerialQueue(() => now);
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => (finish = resolve));
    const result = queue.enqueue(async () => ({ result: Promise.resolve("ok"), settled }));
    expect(queue.pending()).toBe(1);
    await expect(result).resolves.toBe("ok");
    // The answer is back but the native generation has not stopped yet: still busy.
    expect(queue.pending()).toBe(1);
    now = 5_000;
    finish();
    await queue.idle();
    expect(queue.pending()).toBe(0);
    expect(queue.lastActivity()).toBe(5_000);
  });

  it("counts a failed start as finished", async () => {
    const queue = createSerialQueue(() => 0);
    await expect(queue.enqueue(() => Promise.reject(new Error("no")))).rejects.toThrow("no");
    await queue.idle();
    expect(queue.pending()).toBe(0);
  });
});
