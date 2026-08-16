import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { getPackageVersion } from "../src/utils/version.js";

describe("getPackageVersion", () => {
  it("matches package.json version", () => {
    const packageJson = createRequire(import.meta.url)("../package.json") as { version: string };
    expect(getPackageVersion()).toBe(packageJson.version);
  });
});
