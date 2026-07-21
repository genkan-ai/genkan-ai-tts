import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const allowedHost = process.env.GENKAN_ALLOWED_HOST?.trim();

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    allowedHosts: allowedHost ? [allowedHost] : [],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
