import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAnalyze } from "../src/cli/analyze.js";
import { CliError } from "../src/io/errors.js";
import { setLanguage } from "../src/i18n/index.js";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

describe("runAnalyze", () => {
  let tempDir = "";

  beforeEach(async () => {
    setLanguage("en");
    tempDir = await mkdtemp(path.join(os.tmpdir(), "comfy-agent-analyze-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns size and limit when image exceeds 8MiB", async () => {
    const imagePath = path.join(tempDir, "large.png");
    const size = 9 * 1024 * 1024;
    await writeFile(imagePath, Buffer.alloc(size));

    try {
      await runAnalyze(imagePath, {
        prompt: "A cat",
        apiKey: "dummy-api-key",
      });
      throw new Error("expected IMAGE_TOO_LARGE");
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      const cliErr = err as CliError;
      expect(cliErr.code).toBe("IMAGE_TOO_LARGE");
      expect(cliErr.message).toContain("9.00 MiB");
      expect(cliErr.message).toContain("8.00 MiB");
      expect(cliErr.details).toMatchObject({
        size,
        max: MAX_IMAGE_BYTES,
      });
    }
  });
});
