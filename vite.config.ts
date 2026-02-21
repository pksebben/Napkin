import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["@excalidraw/excalidraw"],
    esbuildOptions: {
      target: "es2022",
    },
  },
  server: {
    port: 5173,
  },
});
