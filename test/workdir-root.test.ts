import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveWorkdirRootFrom } from "../src/io/workdir.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

describe("resolveWorkdirRootFrom", () => {
  it("finds the nearest workdir root from a subdirectory", async () => {
    const tmp = await createTmpWorkdir();
    const nested = path.join(tmp.cwd, "nested", "child");
    await fs.mkdir(nested, { recursive: true });

    expect(resolveWorkdirRootFrom(nested)).toBe(tmp.cwd);
  });

  it("falls back to the current working directory without a marker", async () => {
    const tmp = await createTmpWorkdir();
    const nested = path.join(tmp.root, "unmarked", "child");
    await fs.mkdir(nested, { recursive: true });

    expect(resolveWorkdirRootFrom(nested)).toBe(process.cwd());
  });
});
