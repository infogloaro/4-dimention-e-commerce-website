import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/env.ts"],
    // integration tests share one database → run files serially
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
