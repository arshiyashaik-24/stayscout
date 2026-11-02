import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@stayscout/ranking": fileURLToPath(new URL("../../packages/ranking/src/index.ts", import.meta.url)) },
  },
  server: { port: 5173, proxy: { "/api": "http://localhost:3001" } },
});
