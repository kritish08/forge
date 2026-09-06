import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Replaces Create React App + craco. react-scripts 5.0.1 shipped in Jan 2022 and
// CRA was retired in Feb 2025; craco existed here only to bolt aliases, watch
// options and the Emergent visual-edit babel plugins onto its webpack config.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    // The app is reached over the LAN when testing on a phone.
    host: true,
  },
  build: {
    // CRA wrote to build/; the Dockerfile and deploy docs expect that path.
    outDir: "build",
    // Source maps for the whole application source used to be published
    // alongside the bundle.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the /static/ layout CRA produced: nginx.conf caches /static/
        // immutably and returns real 404s there, and the service worker treats
        // that prefix as content-addressed and safe to cache first.
        entryFileNames: "static/js/[name].[hash].js",
        chunkFileNames: "static/js/[name].[hash].js",
        assetFileNames: (info) => {
          const name = info.names?.[0] ?? info.name ?? "";
          if (name.endsWith(".css")) return "static/css/[name].[hash][extname]";
          return "static/media/[name].[hash][extname]";
        },
      },
    },
  },
  test: {
    // describe/test/expect without importing them, so the suite reads the same
    // as it did under CRA's jest.
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
    // Pure-logic suites don't need a DOM; the render smoke tests do. Per-file
    // rather than global, so the fast tests stay fast.
    setupFiles: ["./src/test-setup.js"],
    environmentMatchGlobs: [
      ["src/**/*.render.test.jsx", "jsdom"],
      ["**", "node"],
    ],
  },
});
