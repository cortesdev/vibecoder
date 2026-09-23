import path from "node:path";
import { defineConfig } from "vitest/config";

// `@` mirrors the tsconfig path alias, so tests can import the same modules the
// app does instead of reaching for relative paths that only exist in tests.
export default defineConfig({
  resolve: {
    alias: { "@": path.join(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
