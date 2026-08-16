import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "test/smoke/**"],
    // Several unit tests spawn the CLI through tsx (~1s each); CI runners need more than the 5s default.
    testTimeout: 30_000,
  },
});
