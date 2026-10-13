import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  publicDir: "../../public",
  plugins: [react()],
  build: {
    outDir: "../../.vite/renderer/main_window",
    emptyOutDir: true,
    sourcemap: true,
  },
});
