import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: { path: "./backend/openapi.json" },
  output: {
    path: "src/shared/api/generated",
    clean: true,
  },
});
