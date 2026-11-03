import { describe, expect, it } from "vitest";
import { MemoryResearchRunRepository } from "../repositories/memory-repositories";
import type { NewRun } from "../repositories/types";
import { createWorker, type JobHandler } from "./worker";

const deep = (title: string): NewRun => ({ kind: "deep_research", title, locale: "fr", countries: ["FR"], params: { product: title }, status: "pending" });

function setup(handler: JobHandler) {
  const runs = new MemoryResearchRunRepository();
  const worker = createWorker({ runs: async () => runs, handlers: { deep_research: handler } });
  return { runs, worker };
}

describe("background worker", () => {
  it("runs the waiting research one at a time, oldest first, and keeps each result", async () => {
    const order: string[] = [];
    let busy = 0;
    const { runs, worker } = setup(async ({ run, report }) => {
      busy += 1;
      expect(busy).toBe(1);
      order.push(run.title);
      report({ progress: 0.5, step: "read", detail: "a.example" });
      await new Promise((r) => setTimeout(r, 5));
      busy -= 1;
      return { status: "completed", result: { title: run.title }, sourceCount: 3 };
    });
    const a = await runs.start(deep("a"));
    const b = await runs.start(deep("b"));
    worker.kick();
    worker.kick();
    await worker.idle();

    expect(order).toEqual(["a", "b"]);
    expect(await runs.findById(a)).toMatchObject({ status: "completed", result: { title: "a" }, sourceCount: 3 });
    expect(await runs.findById(b)).toMatchObject({ status: "completed" });
  });

  it("saves the progress while the research works", async () => {
    let seen: unknown = null;
    const { runs, worker } = setup(async ({ run, report }) => {
      report({ progress: 0.3, step: "shops", detail: "qwetch.com" });
      await new Promise((r) => setTimeout(r, 5));
      seen = await runs.findById(run.id);
      return { status: "completed" };
    });
    await runs.start(deep("a"));
    worker.kick();
    await worker.idle();
    expect(seen).toMatchObject({ status: "running", progress: 0.3, step: '{"step":"shops","detail":"qwetch.com"}' });
  });

  it("stops a running research on request, and cancels a waiting one before it starts", async () => {
    let started: (() => void) | null = null;
    const startedOnce = new Promise<void>((r) => (started = r));
    const { runs, worker } = setup(
      ({ signal }) =>
        new Promise((resolve) => {
          started?.();
          signal.addEventListener("abort", () => resolve({ status: "failed", error: "no_report" }));
        }),
    );
    const running = await runs.start(deep("running"));
    const waiting = await runs.start(deep("waiting"));
    worker.kick();
    await startedOnce;
    expect(worker.current()).toBe(running);

    expect(await worker.cancel(waiting)).toBe(true);
    expect(await worker.cancel(running)).toBe(true);
    await worker.idle();
    expect((await runs.findById(running))?.status).toBe("cancelled");
    expect((await runs.findById(waiting))?.status).toBe("cancelled");
  });

  it("marks a stopped research as stopped, and keeps the partial report it made", async () => {
    let started: (() => void) | null = null;
    const startedOnce = new Promise<void>((r) => (started = r));
    const { runs, worker } = setup(
      ({ signal }) =>
        new Promise((resolve) => {
          started?.();
          signal.addEventListener("abort", () => resolve({ status: "completed", result: { partial: true }, sourceCount: 4 }));
        }),
    );
    const id = await runs.start(deep("a"));
    worker.kick();
    await startedOnce;
    await worker.cancel(id);
    await worker.idle();
    expect(await runs.findById(id)).toMatchObject({ status: "cancelled", result: { partial: true }, sourceCount: 4 });
  });

  it("turns a job that throws into a failed run, and goes on with the next", async () => {
    const { runs, worker } = setup(async ({ run }) => {
      if (run.title === "broken") throw new Error("boom");
      return { status: "completed" };
    });
    const broken = await runs.start(deep("broken"));
    const fine = await runs.start(deep("fine"));
    worker.kick();
    await worker.idle();
    expect(await runs.findById(broken)).toMatchObject({ status: "failed", error: "job_failed" });
    expect((await runs.findById(fine))?.status).toBe("completed");
  });

  it("fails a kind it has no job for, without touching the others", async () => {
    const { runs, worker } = setup(async () => ({ status: "completed" }));
    const other = await runs.start({ ...deep("x"), kind: "competitor" });
    worker.kick();
    await worker.idle();
    expect(await runs.findById(other)).toMatchObject({ status: "failed", error: "no_handler" });
  });

  it("waits for the database when it cannot be opened, then works on the next kick", async () => {
    const runs = new MemoryResearchRunRepository();
    let available = false;
    const worker = createWorker({
      runs: async () => {
        if (!available) throw new Error("closed");
        return runs;
      },
      handlers: { deep_research: async () => ({ status: "completed" }) },
    });
    const id = await runs.start(deep("a"));
    worker.kick();
    await worker.idle();
    expect((await runs.findById(id))?.status).toBe("pending");
    available = true;
    worker.kick();
    await worker.idle();
    expect((await runs.findById(id))?.status).toBe("completed");
  });
});

describe("deep research job", () => {
  it("refuses stored parameters it cannot read, without starting anything", async () => {
    const { deepResearchJob } = await import("./deep-job");
    const runs = new MemoryResearchRunRepository();
    const id = await runs.start({ ...deep("x"), params: { nope: true } });
    const run = (await runs.findById(id))!;
    expect(await deepResearchJob()({ run, signal: new AbortController().signal, report: () => undefined })).toEqual({ status: "failed", error: "invalid_params" });
  });
});
