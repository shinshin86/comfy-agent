import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runColabKit } from "../src/cli/colab.js";

afterEach(() => vi.restoreAllMocks());

describe("colab kit", () => {
  it("returns the catalog item and existing bundled paths", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const payload = await runColabKit("z_image", { json: true });
    expect(payload).toMatchObject({
      ok: true,
      kit: { name: "z_image", setup_file: "01_setup.py", workflows: expect.any(Array) },
      paths: {
        dir: expect.any(String),
        setup: expect.any(String),
        launcher: expect.any(String),
        workflows: { "z_image_turbo.json": expect.any(String) },
      },
    });
    await expect(fs.stat(payload.paths.dir)).resolves.toBeDefined();
    await expect(fs.stat(payload.paths.setup)).resolves.toBeDefined();
    await expect(fs.stat(payload.paths.launcher)).resolves.toBeDefined();
    await expect(fs.stat(payload.paths.workflows["z_image_turbo.json"])).resolves.toBeDefined();
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
  });

  it("rejects an unknown kit with available names", async () => {
    await expect(runColabKit("missing", { json: true })).rejects.toMatchObject({
      code: "COLAB_KIT_NOT_FOUND",
      exitCode: 2,
      details: { name: "missing", available: expect.arrayContaining(["z_image"]) },
    });
  });
});
