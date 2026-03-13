import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/app/",
  server: {
    host: "::",
    port: 5172,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/user": {
        target: "http://127.0.0.1:5173",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => (path === "/user" ? "/user/" : path),
      },
      "/creator": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => (path === "/creator" ? "/creator/" : path),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
