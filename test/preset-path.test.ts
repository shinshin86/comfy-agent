import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePresetPath } from "../src/preset/path.js";
import { CliError } from "../src/io/errors.js";
import { setLanguage } from "../src/i18n/index.js";

const originalCwd = process.cwd();

describe("resolvePresetPath", () => {
  let tempDir = "";

  beforeEach(async () => {
    setLanguage("en");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "comfy-agent-preset-path-"));
    await mkdir(path.join(tempDir, ".comfy-agent", "presets"), { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves .yaml first", async () => {
    await writeFile(path.join(tempDir, ".comfy-agent", "presets", "sample.yaml"), "name: sample\n");
    const resolved = await resolvePresetPath("sample", "local");
    expect(resolved.endsWith("sample.yaml")).toBe(true);
  });

  it("throws PRESET_NOT_FOUND when file does not exist", async () => {
    try {
      await resolvePresetPath("missing", "local");
      throw new Error("expected PRESET_NOT_FOUND");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe("PRESET_NOT_FOUND");
    }
  });
});
