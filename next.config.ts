import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM + data files resolved at runtime: keep it out of the server bundle.
  // node-llama-cpp loads native prebuilt binaries (.node) at runtime: same reason.
  serverExternalPackages: ["@electric-sql/pglite", "node-llama-cpp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
