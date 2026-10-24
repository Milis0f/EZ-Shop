import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOCAL_AI_MODEL_PATH, getEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local AI environment", () => {
  it("is enabled with the default model path when nothing is set", () => {
    vi.stubEnv("LOCAL_AI_ENABLED", undefined);
    vi.stubEnv("LOCAL_AI_MODEL_PATH", undefined);
    const env = getEnv();
    expect(env.LOCAL_AI_ENABLED).toBe(true);
    expect(env.LOCAL_AI_MODEL_PATH).toBe(DEFAULT_LOCAL_AI_MODEL_PATH);
  });

  it("treats empty values as unset", () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "");
    vi.stubEnv("LOCAL_AI_MODEL_PATH", "  ");
    const env = getEnv();
    expect(env.LOCAL_AI_ENABLED).toBe(true);
    expect(env.LOCAL_AI_MODEL_PATH).toBe(DEFAULT_LOCAL_AI_MODEL_PATH);
  });

  it("reads \"false\" as disabled and keeps a custom model path", () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "false");
    vi.stubEnv("LOCAL_AI_MODEL_PATH", "D:/models/other.gguf");
    const env = getEnv();
    expect(env.LOCAL_AI_ENABLED).toBe(false);
    expect(env.LOCAL_AI_MODEL_PATH).toBe("D:/models/other.gguf");
  });

  it("rejects a value that is neither true nor false", () => {
    vi.stubEnv("LOCAL_AI_ENABLED", "yes");
    expect(() => getEnv()).toThrow("Invalid server environment: LOCAL_AI_ENABLED");
  });
});
