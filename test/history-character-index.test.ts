import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendCharacterIndex } from "../src/characters/store.js";
import { writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

describe("history global character index", () => {
  it("loads cross-project records and truncates their prompts", async () => {
    const tmp = await createTmpWorkdir();
    const cliOptions = {
      cwd: tmp.cwd,
      env: {
        HOME: tmp.home,
        USERPROFILE: tmp.home,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    };
    const created = await runCli(
      ["character", "create", "shared", "--appearance", "shared face", "--global", "--json"],
      cliOptions,
    );
    expect(created.code, created.stderr).toBe(0);
    const globalCharacterPath = path.join(
      tmp.home,
      ".config",
      ".comfy-agent",
      "characters",
      "shared",
    );
    const otherProject = path.join(tmp.root, "other-project");
    await fs.mkdir(otherProject, { recursive: true });
    const prompt = "x".repeat(80);
    const record: JobRecord = {
      version: 2,
      job_id: "cross-project-job",
      prompt_id: "cross-project-job",
      client_id: "cross-project-client",
      batch_id: "cross-project-job",
      batch_index: 1,
      batch_count: 1,
      scope: "local",
      base_url: "http://127.0.0.1:8188",
      preset: "portrait",
      source: "local",
      params: {},
      uploads: {},
      seed: null,
      output_dir: path.join(otherProject, "output"),
      submitted_at: "2026-08-16T00:00:00.000Z",
      status: "completed",
      outputs: [],
      character: { name: "shared", scope: "global", form: "default" },
      prompt_input: "portrait",
      prompt_final: prompt,
    };
    await writeJob(record, otherProject, "local");
    await appendCharacterIndex(globalCharacterPath, {
      job_id: record.job_id,
      at: record.submitted_at,
      project: otherProject,
      preset: record.preset,
      output_dir: record.output_dir,
      prompt_final: prompt.slice(0, 60),
    });

    const result = await runCli(
      ["history", "--character", "shared", "--all-scopes", "--json"],
      cliOptions,
    );
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      total: 1,
      jobs: [{ job_id: record.job_id, prompt_final: "x".repeat(60) }],
    });
  });
});
