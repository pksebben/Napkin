import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/client",
  },
  test: {
    exclude: ["dist/**", "node_modules/**"],
  },
  optimizeDeps: {
    include: ["@excalidraw/excalidraw"],
    esbuildOptions: {
      target: "es2022",
    },
  },
  server: {
    port: 5173,
    proxy: {
      "^/s/.*/ws$": {
        target: "ws://localhost:3210",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3210",
      },
    },
  },
});
