import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { addGalleryItem, approveGalleryItems, readGallery } from "../src/characters/gallery.js";
import { createCharacter } from "../src/characters/store.js";
import { readJob, writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const completedJob = (cwd: string, outputDir: string): JobRecord => ({
  version: 1,
  job_id: "gallery-job-1234",
  prompt_id: "gallery-job-1234",
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
  seed: 42,
  output_dir: outputDir,
  submitted_at: "2026-08-16T00:00:00.000Z",
  completed_at: "2026-08-16T00:00:01.000Z",
  status: "completed",
  outputs: [
    {
      filename: "portrait.png",
      kind: "image",
      saved_to: "portrait.png",
    },
  ],
});

describe("character gallery", () => {
  it("copies a record output as pending and marks it human-approved and favorite", async () => {
    const tmp = await createTmpWorkdir();
    const character = await createCharacter({ name: "miko" }, { cwd: tmp.cwd, scope: "local" });
    const outputDir = path.join(tmp.workdir, "outputs", "portrait");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "portrait.png"), "png-data", "utf-8");
    const job = completedJob(tmp.cwd, outputDir);
    await writeJob(job, tmp.cwd, "local");

    const item = await addGalleryItem(
      character.path,
      { jobId: job.job_id, outputIndex: 0, caption: "approved portrait", tags: ["front"] },
      { cwd: tmp.cwd },
    );
    expect(item).toMatchObject({
      job_id: job.job_id,
      output_index: 0,
      approved: "pending",
      caption: "approved portrait",
    });
    await expect(
      fs.readFile(path.join(character.path, ...item.file.split("/")), "utf-8"),
    ).resolves.toBe("png-data");

    await approveGalleryItems(character.path, [item.id]);
    expect((await readGallery(character.path)).items[0]).toMatchObject({
      id: item.id,
      approved: "human",
    });
    expect((await readJob(job.job_id, tmp.cwd, "local")).record.favorite).toBe(true);
  });
});
