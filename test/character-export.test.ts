import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportCharacter, importCharacter } from "../src/characters/export.js";
import { addGalleryItem } from "../src/characters/gallery.js";
import { addReference, createCharacter, resolveCharacter } from "../src/characters/store.js";
import { writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const jobRecord = (outputDir: string): JobRecord => ({
  version: 1,
  job_id: "export-job-1234",
  prompt_id: "export-job-1234",
  client_id: "client",
  batch_id: "batch",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "portrait",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: outputDir,
  submitted_at: "2026-08-16T00:00:00.000Z",
  status: "completed",
  outputs: [{ filename: "result.png", kind: "image", saved_to: "result.png" }],
});

describe("character export and import", () => {
  it("exports metadata by default, optionally includes files, and imports across workdirs", async () => {
    const sourceTmp = await createTmpWorkdir();
    const created = await createCharacter(
      { name: "miko", appearance: "dark bob hair" },
      { cwd: sourceTmp.cwd, scope: "local" },
    );
    const reference = path.join(sourceTmp.root, "front.png");
    await fs.writeFile(reference, "ref-data", "utf-8");
    await addReference("miko", { source: reference }, { cwd: sourceTmp.cwd });
    const outputDir = path.join(sourceTmp.workdir, "outputs", "portrait");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "result.png"), "gallery-data", "utf-8");
    const job = jobRecord(outputDir);
    await writeJob(job, sourceTmp.cwd, "local");
    const galleryItem = await addGalleryItem(
      created.path,
      { jobId: job.job_id, outputIndex: 0 },
      { cwd: sourceTmp.cwd },
    );

    const metadataOut = path.join(sourceTmp.root, "metadata-export");
    await exportCharacter(created.path, metadataOut);
    await expect(fs.stat(path.join(metadataOut, "character.yaml"))).resolves.toBeDefined();
    await expect(fs.stat(path.join(metadataOut, "notes.md"))).resolves.toBeDefined();
    const galleryRaw = await fs.readFile(path.join(metadataOut, "gallery.json"), "utf-8");
    expect(galleryRaw).not.toContain(sourceTmp.root);
    await expect(fs.stat(path.join(metadataOut, "refs", "front.png"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.stat(path.join(metadataOut, ...galleryItem.file.split("/"))),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const fullOut = path.join(sourceTmp.root, "full-export");
    await exportCharacter(created.path, fullOut, { withRefs: true, withGallery: true });
    await expect(fs.stat(path.join(fullOut, "refs", "front.png"))).resolves.toBeDefined();
    await expect(
      fs.stat(path.join(fullOut, ...galleryItem.file.split("/"))),
    ).resolves.toBeDefined();

    const destinationTmp = await createTmpWorkdir();
    const imported = await importCharacter(fullOut, {
      cwd: destinationTmp.cwd,
      scope: "local",
    });
    expect(imported.character).toEqual(
      (await resolveCharacter("miko", { cwd: destinationTmp.cwd })).character,
    );
    expect(imported.character.appearance).toBe("dark bob hair");
    await expect(
      importCharacter(fullOut, { cwd: destinationTmp.cwd, scope: "local" }),
    ).rejects.toMatchObject({ code: "CHARACTER_IMPORT_CONFLICT", exitCode: 2 });
  });
});
