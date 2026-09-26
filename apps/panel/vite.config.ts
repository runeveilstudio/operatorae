import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * CEF-safe build (docs/02 §2.1): CEP 11 ships Chromium 88, so the bundle
 * targets chrome88/es2020. Workspace packages resolve to SOURCE in both dev
 * and build — the panel always bundles fresh package code.
 */
const alias = (find: string, replacement: string) => ({
  find,
  replacement: path.resolve(__dirname, replacement)
});

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: [
      alias("@operator/ae-types", "../../packages/ae-types/src"),
      alias("@operator/ae-mock", "../../packages/ae-mock/src"),
      alias("@operator/protocol", "../../packages/protocol/src"),
      alias("@operator/command-core", "../../packages/command-core/src"),
      alias("@operator/host-adapter", "../../packages/host-adapter/src"),
      alias("@operator/pathkit", "../../packages/pathkit/src"),
      alias("@operator/parsers", "../../packages/parsers/src"),
      alias("@operator/i18n", "../../packages/i18n/src"),
      alias("@operator/jsx", "../jsx/src"),
      alias("@operator/ui-kit", "../../packages/ui-kit/src")
    ]
  },
  build: {
    target: ["chrome88", "es2020"],
    outDir: "dist",
    emptyOutDir: true
  }
});
