import { describe, expect, it, vi } from "vitest";
import { apiErrorFrom } from "./api-response";
import { LocalDatabaseError } from "./db/client";

describe("API errors", () => {
  it("says the local database is damaged instead of a bare internal error, and logs its folder only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorFrom(new LocalDatabaseError(".data/pglite", { cause: new Error("Aborted()") }), "fr");
    expect(response.status).toBe(503);
    const body = (await response.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("database_unavailable");
    expect(body.error.message).toContain(".data/pglite");
    expect(log).toHaveBeenCalledWith("[api] local database unavailable", ".data/pglite");
    log.mockRestore();
  });

  it("keeps other failures internal", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiErrorFrom(new Error("boom"), "en");
    expect(response.status).toBe(500);
    log.mockRestore();
  });
});
