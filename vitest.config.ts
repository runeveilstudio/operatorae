import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Tests import workspace packages by name; alias them to SRC so test runs are
 * always fresh (no stale dist), per docs/06 §3 dev loop.
 */
const packages: Record<string, string> = {
  "@operator/ae-types": "packages/ae-types/src",
  "@operator/ae-mock": "packages/ae-mock/src",
  "@operator/protocol": "packages/protocol/src",
  "@operator/command-core": "packages/command-core/src",
  "@operator/host-adapter": "packages/host-adapter/src",
  "@operator/pathkit": "packages/pathkit/src",
  "@operator/parsers": "packages/parsers/src",
  "@operator/i18n": "packages/i18n/src",
  "@operator/sidecar": "apps/sidecar/src",
  "@operator/jsx": "apps/jsx/src"
};

export default defineConfig({
  resolve: {
    alias: Object.entries(packages).map(([find, replacement]) => ({
      find,
      replacement: path.resolve(__dirname, replacement)
    }))
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "tools/**/*.test.ts"
    ],
    environment: "node",
    reporters: "default",
    passWithNoTests: false
  }
});
