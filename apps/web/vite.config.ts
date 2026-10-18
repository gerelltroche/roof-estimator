import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Set VITE_BASE=/roof-estimator/ when deploying to GitHub Pages.
  base: process.env.VITE_BASE ?? "/",
  server: { port: 5173 },
});
