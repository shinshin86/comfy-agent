import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/smoke/**/*.smoke.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
