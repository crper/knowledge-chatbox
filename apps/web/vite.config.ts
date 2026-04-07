import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite-plus";

const srcDir = new URL("./src", import.meta.url).pathname;

export default defineConfig({
  envDir: "../..",
  lint: { options: { typeAware: true, typeCheck: true } },
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
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    clearMocks: true,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    unstubGlobals: true,
  },
});
