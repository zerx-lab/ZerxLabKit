import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    // The router plugin must run before the React plugin.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Proxy backend calls during development. Keep the trailing slash so
      // SPA routes like "/apis" are NOT swallowed by a bare "/api" prefix.
      "/api/": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  build: {
    // Output into the Go embed directory so the binary serves the SPA.
    outDir: "../internal/web/dist",
    emptyOutDir: true,
  },
});
