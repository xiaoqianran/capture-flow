import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@capture-flow/core": resolve(root, "packages/core/src/index.ts"),
      "@capture-flow/runtime": resolve(root, "packages/runtime/src/index.ts"),
      "@capture-flow/hub-client": resolve(root, "packages/hub-client/src/index.ts"),
      "@capture-flow/ui": resolve(root, "packages/ui/src/index.ts"),
    },
  },
  build: {
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(root, "apps/userscript/src/main.ts"),
      formats: ["iife"],
      name: "CaptureFlow",
      fileName: () => "capture-flow.bundle.js",
    },
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
    outDir: resolve(root, "dist/userscript/.build"),
  },
});
