import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * Library build. Two entries:
 *   roof-quote.js — registers <roof-quote>; import it for its side effect.
 *   react.js      — the React component, for React apps that want a component.
 * React and MapLibre are bundled so a single <script type="module"> works
 * from a CDN. MapLibre is in its own chunk and only fetched when a quote
 * renders a map.
 */
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: {
      entry: { "roof-quote": resolve(__dirname, "src/index.ts"), react: resolve(__dirname, "src/react.ts") },
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("maplibre-gl")) return "maplibre";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
});
