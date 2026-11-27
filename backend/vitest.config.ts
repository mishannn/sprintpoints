import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { CORS_ORIGINS: "https://allowed.example", ADMIN_TOKEN: "test-admin" },
      },
    }),
  ],
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});
