import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const githubPagesBase = repositoryName ? `/${repositoryName}/` : "/";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || githubPagesBase,
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_URL || "http://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
