import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // video/ runs its own tests with node:test (npm test in video/)
    exclude: [...configDefaults.exclude, "video/**"],
  },
});
