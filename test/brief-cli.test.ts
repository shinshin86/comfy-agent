import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeGallery } from "../src/characters/gallery.js";
import { appendNote } from "../src/characters/notes.js";
import { createCharacter } from "../src/characters/store.js";
import { writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const job = (cwd: string, id: string, patch: Partial<JobRecord> = {}): JobRecord => ({
  version: 2,
  job_id: id,
  prompt_id: id,
  client_id: `${id}-client`,
  batch_id: id,
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "portrait",
  source: "local",
  params: {},
  uploads: {},
  seed: 42,
  output_dir: path.join(cwd, "outputs", id),
  submitted_at: "2026-08-16T00:00:00.000Z",
  completed_at: "2026-08-16T00:00:01.000Z",
  status: "completed",
  outputs: [{ filename: `${id}.png`, kind: "image", saved_to: `${id}.png` }],
  character: { name: "miko", scope: "local", form: "default" },
  prompt_input: "portrait",
  prompt_final: `m1ko dark bob hair, ${id}`,
  ...patch,
});

describe("brief CLI", () => {
  it("returns applicability, selected history, rejects, and only human-approved gallery", async () => {
    const tmp = await createTmpWorkdir();
    const resolved = await createCharacter(
      {
        name: "miko",
        appearance: "dark bob hair",
        triggers: { default: "m1ko" },
        negative: "extra fingers",
      },
      { cwd: tmp.cwd },
    );
    await fs.writeFile(
      path.join(tmp.workdir, "presets", "portrait.yaml"),
      [
        "version: 1",
        "name: portrait",
        "workflow: portrait.json",
        "parameters:",
        "  text:",
        "    type: string",
        "    role: prompt",
        "    default: portrait",
        "    target: { node_id: '1', input: text }",
        "  negative:",
        "    type: string",
        "    role: negative_prompt",
        "    default: ''",
        "    target: { node_id: '2', input: text }",
        "",
      ].join("\n"),
      "utf-8",
    );
    await Promise.all([
      writeJob(
        job(tmp.cwd, "favorite", {
          favorite: true,
          verify: {
            at: "2026-08-16T00:01:00.000Z",
            files: 1,
            kind: "image",
            checks_failed: 0,
          },
        }),
        tmp.cwd,
        "local",
      ),
      writeJob(
        job(tmp.cwd, "rejected", {
          tags: ["reject"],
          reject_reason: "identity drift",
        }),
        tmp.cwd,
        "local",
      ),
      appendNote(resolved.path, {
        at: "2026-08-16T00:00:00.000Z",
        text: "Keep the red hairpin visible",
      }),
    ]);
    await writeGallery(resolved.path, {
      version: 1,
      items: [
        {
          id: "g_pending",
          job_id: "favorite",
          output_index: 0,
          file: "gallery/pending.png",
          approved: "pending",
          added_at: "2026-08-16T00:00:00.000Z",
        },
        {
          id: "g_human",
          job_id: "favorite",
          output_index: 0,
          file: "gallery/human.png",
          caption: "approved portrait",
          approved: "human",
          added_at: "2026-08-16T00:00:00.000Z",
          approved_at: "2026-08-16T00:01:00.000Z",
        },
      ],
    });

    const result = await runCli(["brief", "miko", "--preset", "portrait", "--json"], {
      cwd: tmp.cwd,
      env: {
        HOME: tmp.home,
        USERPROFILE: tmp.home,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      character: {
        name: "miko",
        scope: "local",
        form: "default",
        appearance: "dark bob hair",
        trigger: "m1ko",
      },
      preset: "portrait",
      applicable: { prompt: true, negative: true, reference: false, lora: false },
      prompt_preview: "m1ko dark bob hair, {prompt}",
      top_jobs: [{ job_id: "favorite", favorite: true, verify: { checks_failed: 0 } }],
      avoid: [{ job_id: "rejected", reject_reason: "identity drift" }],
      gallery: [{ id: "g_human", caption: "approved portrait" }],
      recent_notes: expect.stringContaining("Keep the red hairpin visible"),
      warnings: expect.any(Array),
    });
  });
});
