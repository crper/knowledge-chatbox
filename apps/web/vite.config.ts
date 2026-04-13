import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite-plus";

const srcDir = new URL("./src", import.meta.url).pathname;

const apiProxyTarget = (() => {
  const apiPort = process.env.API_PORT?.trim();
  const resolvedPort = apiPort && /^\d+$/.test(apiPort) ? apiPort : "8000";
  return `http://localhost:${resolvedPort}`;
})();

export default defineConfig({
  envDir: "../..",
  lint: { options: { typeAware: true, typeCheck: true } },
  staged: {
    "*.{js,ts,tsx,vue,svelte}": "vp check --fix",
  },
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      target: "react",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  server: {
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    clearMocks: true,
    environment: "jsdom",
    environmentOptions: {
      url: "http://localhost:3000",
    },
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    unstubGlobals: true,
  },
});
