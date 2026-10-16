import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/engine/**", "src/providers/**", "src/domain/**", "src/server/pipeline/**"],
      // Declaration-only modules (types / interfaces) carry no executable code.
      exclude: ["**/*.test.ts", "src/domain/market.ts", "src/domain/product.ts", "src/domain/scoring.ts", "src/engine/scoring/types.ts"],
    },
  },
});
