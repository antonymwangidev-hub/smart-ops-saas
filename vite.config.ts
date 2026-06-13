import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise warning threshold so Lovable's pipeline doesn't treat it as a hard error
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — loaded first, cached longest
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Supabase client
          "vendor-supabase": ["@supabase/supabase-js"],
          // UI component library
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-switch",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-tooltip",
            "lucide-react",
          ],
          // Charts (heavy — split out)
          "vendor-charts": ["recharts"],
          // Data / spreadsheet libs (heavy — split out, only loaded on Products import)
          "vendor-spreadsheet": ["xlsx"],
          // Offline sync lib
          "vendor-offline": ["dexie"],
          // React Query
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
}));
