import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeGallery } from "../src/characters/gallery.js";
import { createCharacter } from "../src/characters/store.js";
import { detectTools } from "../src/verify/ffmpeg.js";
import { probeFile } from "../src/verify/probe.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const tools = await detectTools();

const optionsFor = (cwd: string, home: string, env = {}) => ({
  cwd,
  env: {
    HOME: home,
    USERPROFILE: home,
    COMFY_AGENT_TEST_ENTRY: "tsx",
    ...env,
  },
});

const characterWithApprovedImage = async () => {
  const tmp = await createTmpWorkdir();
  const resolved = await createCharacter({ name: "miko" }, { cwd: tmp.cwd });
  const source = path.resolve("test/fixtures/verify/1x1.png");
  const destination = path.join(resolved.path, "gallery", "approved.png");
  await fs.copyFile(source, destination);
  await writeGallery(resolved.path, {
    version: 1,
    items: [
      {
        id: "g_approved",
        job_id: "job-1",
        output_index: 0,
        file: "gallery/approved.png",
        approved: "human",
        added_at: "2026-08-16T00:00:00.000Z",
        approved_at: "2026-08-16T00:01:00.000Z",
      },
    ],
  });
  return { tmp, resolved };
};

describe("character sheet", () => {
  it("returns GALLERY_EMPTY when no item has human approval", async () => {
    const tmp = await createTmpWorkdir();
    await createCharacter({ name: "empty" }, { cwd: tmp.cwd });
    const result = await runCli(
      ["character", "sheet", "empty", "--json"],
      optionsFor(tmp.cwd, tmp.home),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "GALLERY_EMPTY" } });
  });

  it("returns MISSING_TOOL when ffmpeg is unavailable", async () => {
    const { tmp } = await characterWithApprovedImage();
    const missing = path.join(tmp.root, "missing-ffmpeg");
    const result = await runCli(
      ["character", "sheet", "miko", "--json"],
      optionsFor(tmp.cwd, tmp.home, { COMFY_AGENT_FFMPEG: missing }),
    );
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "MISSING_TOOL" } });
  });

  it.skipIf(!tools.ffmpeg.available)("tiles approved images into a PNG", async () => {
    const { tmp } = await characterWithApprovedImage();
    const output = path.join(tmp.cwd, "miko-sheet.png");
    const result = await runCli(
      ["character", "sheet", "miko", "--out", output, "--json"],
      optionsFor(tmp.cwd, tmp.home),
    );
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      character: "miko",
      sheet: output,
      items: [{ id: "g_approved" }],
    });
    await expect(probeFile(output)).resolves.toMatchObject({ kind: "image", format: "png" });
  });
});
