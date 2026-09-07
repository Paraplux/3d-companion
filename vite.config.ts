import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        // Isolate three.js from the lazy ModelViewer app chunk. Do not force
        // @react-three/* into a manual chunk — that pulls shared runtime into
        // the entry and defeats viewer lazy-loading.
        manualChunks(id) {
          if (
            id.includes("node_modules/three/") ||
            id.includes("node_modules/.pnpm/three@")
          ) {
            return "three";
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
