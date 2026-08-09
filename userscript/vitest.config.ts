import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@capture-flow/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@capture-flow/runtime": resolve(__dirname, "packages/runtime/src/index.ts"),
      "@capture-flow/hub-client": resolve(__dirname, "packages/hub-client/src/index.ts"),
      "@capture-flow/ui": resolve(__dirname, "packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
