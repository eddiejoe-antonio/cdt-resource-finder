import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/csv": {
        target: "https://broadbandforall.cdt.ca.gov",
        changeOrigin: true,
        rewrite: () =>
          "/wp-content/uploads/sites/19/2026/03/converted.csv",
      },
    },
  },
});