import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@stayscout/ranking": fileURLToPath(new URL("./packages/ranking/src/index.ts", import.meta.url)) },
  },
  test: { include: ["packages/*/test/**/*.test.ts", "apps/api/test/**/*.test.ts"] },
});
