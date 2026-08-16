import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { readRunManifest, RUN_MANIFEST_FILE, upsertRunManifest } from "../src/jobs/manifest.js";
import type { RunManifestEntry, RunManifestHeader } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const header: RunManifestHeader = {
  preset: "example",
  source: "local",
  base_url: "http://127.0.0.1:8188",
  scope: "local",
  params: { prompt: "hello" },
  uploads: {},
};

const entry = (promptId: string, status: RunManifestEntry["status"]): RunManifestEntry => ({
  index: 1,
  job_id: promptId,
  prompt_id: promptId,
  status,
  seed: 42,
  outputs: [],
});

describe("run manifest store", () => {
  it("returns null when no manifest exists and creates a new one", async () => {
    const tmp = await createTmpWorkdir();
    const outputDir = path.join(tmp.cwd, "run-output");
    await expect(readRunManifest(outputDir)).resolves.toBeNull();

    const result = await upsertRunManifest(outputDir, header, entry("prompt-1", "submitted"));
    expect(result).toMatchObject({
      ok: true,
      manifest: {
        schema: 1,
        preset: "example",
        runs: [{ prompt_id: "prompt-1", status: "submitted" }],
      },
    });
    await expect(readRunManifest(outputDir)).resolves.toMatchObject({
      ok: true,
      manifest: { runs: [{ prompt_id: "prompt-1" }] },
    });
  });

  it("upserts by prompt_id and preserves created_at", async () => {
    const tmp = await createTmpWorkdir();
    const outputDir = path.join(tmp.cwd, "run-output");
    const first = await upsertRunManifest(outputDir, header, entry("prompt-1", "submitted"));
    if (!first.ok) throw new Error(first.error.message);
    const createdAt = first.manifest.created_at;

    const appended = await upsertRunManifest(outputDir, header, entry("prompt-2", "completed"));
    expect(appended.ok && appended.manifest.runs).toHaveLength(2);

    const replacement: RunManifestEntry = {
      ...entry("prompt-1", "completed"),
      duration_ms: 1234,
      outputs: [
        {
          filename: "image.png",
          type: "output",
          kind: "image",
          saved_to: "image_seed_42.png",
        },
      ],
    };
    const replaced = await upsertRunManifest(outputDir, header, replacement);
    expect(replaced).toMatchObject({
      ok: true,
      manifest: {
        created_at: createdAt,
        runs: [
          { prompt_id: "prompt-1", status: "completed", duration_ms: 1234 },
          { prompt_id: "prompt-2", status: "completed" },
        ],
      },
    });
  });

  it("returns a warning-ready error for corrupt JSON without overwriting it", async () => {
    const tmp = await createTmpWorkdir();
    const outputDir = path.join(tmp.cwd, "run-output");
    const filePath = path.join(outputDir, RUN_MANIFEST_FILE);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(filePath, "{broken-json", "utf-8");

    await expect(readRunManifest(outputDir)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_RUN_MANIFEST", details: { path: filePath } },
    });
    await expect(
      upsertRunManifest(outputDir, header, entry("prompt-1", "submitted")),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_RUN_MANIFEST" } });
    await expect(fs.readFile(filePath, "utf-8")).resolves.toBe("{broken-json");
  });

  it("returns an error instead of throwing when the manifest cannot be written", async () => {
    const tmp = await createTmpWorkdir();
    const outputDir = path.join(tmp.cwd, "run-output");
    await fs.mkdir(path.join(outputDir, `${RUN_MANIFEST_FILE}.tmp`), { recursive: true });

    await expect(
      upsertRunManifest(outputDir, header, entry("prompt-1", "submitted")),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "RUN_MANIFEST_WRITE_FAILED" },
    });
  });
});
