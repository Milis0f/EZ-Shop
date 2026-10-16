import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Mock fixtures are reachable only through the provider registry (which refuses them in production).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/providers/registry.ts", "src/providers/mock/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/providers/mock/*", "**/providers/mock/*", "./mock/*"],
              message: "Mock data must only be wired through src/providers/registry.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.ts"],
    rules: { "no-console": ["warn", { allow: ["error", "warn"] }] },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", ".data/**", "coverage/**"]),
]);

export default eslintConfig;
