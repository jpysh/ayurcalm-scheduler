import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Dev server proxies /api to the local API, so the app uses the same
// same-origin "/api" base in development and in production.
const apiProxy = {
  "/api": {
    target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
    changeOrigin: true,
    secure: false,
  },
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
