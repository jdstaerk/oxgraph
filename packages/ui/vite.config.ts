import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget =
    process.env.OXGRAPH_API_URL ??
    env.OXGRAPH_API_URL ??
    "http://localhost:8888";
  const isDemoMode =
    (process.env.VITE_OXGRAPH_DEMO ?? env.VITE_OXGRAPH_DEMO) === "true";

  return {
    base: isDemoMode ? "./" : "/",
    plugins: [react()],
    test: {
      environment: "jsdom",
      globals: true,
    },
    server: {
      port: 5173,
      strictPort: false,
      hmr: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
    },
  };
});
