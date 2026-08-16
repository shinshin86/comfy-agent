import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeJob } from "../src/jobs/store.js";
import type { JobRecord, RunManifest } from "../src/jobs/types.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const makeJob = (cwd: string): JobRecord => ({
  version: 1,
  job_id: "abcd1234-history-job",
  prompt_id: "abcd1234-history-job",
  client_id: "history-client",
  batch_id: "abcd1234-history-job",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "example",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: path.join(cwd, "outputs", "history-job"),
  submitted_at: "2026-08-16T00:00:00.000Z",
  status: "completed",
  outputs: [{ filename: "image.png", kind: "image", saved_to: "image.png" }],
});

describe("history CLI", () => {
  it("persists notes, tags, rejection reasons, and exposes related artifacts", async () => {
    const tmp = await createTmpWorkdir();
    const job = makeJob(tmp.cwd);
    await writeJob(job, tmp.cwd, "local");
    await fs.mkdir(path.join(job.output_dir, "verify"), { recursive: true });
    const manifest: RunManifest = {
      schema: 1,
      comfy_agent_version: "0.0.3",
      created_at: "2026-08-16T00:00:00.000Z",
      preset: job.preset,
      source: job.source,
      base_url: job.base_url,
      scope: job.scope,
      params: {},
      uploads: {},
      runs: [
        {
          index: 1,
          job_id: job.job_id,
          prompt_id: job.prompt_id,
          status: "completed",
          seed: null,
          outputs: job.outputs,
        },
      ],
    };
    await Promise.all([
      fs.writeFile(path.join(job.output_dir, "run.json"), JSON.stringify(manifest), "utf-8"),
      fs.writeFile(
        path.join(job.output_dir, "verify", "verify.json"),
        JSON.stringify({ summary: { files: 1, checks_failed: 0 } }),
        "utf-8",
      ),
    ]);
    const options = {
      cwd: tmp.cwd,
      env: {
        HOME: tmp.home,
        USERPROFILE: tmp.home,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    };

    const noted = await runCli(["history", "note", "abcd", "keep this", "--json"], options);
    expect(noted.code, noted.stderr).toBe(0);
    expect(JSON.parse(noted.stdout)).toMatchObject({
      ok: true,
      job: { version: 2, notes: [{ at: expect.any(String), text: "keep this" }] },
    });

    const tagged = await runCli(["history", "tag", "abcd", "portrait", "--json"], options);
    expect(tagged.code, tagged.stderr).toBe(0);
    expect(JSON.parse(tagged.stdout)).toMatchObject({ job: { tags: ["portrait"] } });

    const missingReason = await runCli(["history", "tag", "abcd", "reject", "--json"], options);
    expect(missingReason.code).toBe(2);
    expect(JSON.parse(missingReason.stdout)).toMatchObject({
      error: { code: "INVALID_USAGE" },
    });

    const rejected = await runCli(
      ["history", "tag", "abcd", "reject", "--reason", "identity drift", "--json"],
      options,
    );
    expect(rejected.code, rejected.stderr).toBe(0);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      job: { tags: ["portrait", "reject"], reject_reason: "identity drift" },
    });

    const removed = await runCli(
      ["history", "tag", "abcd", "portrait", "--rm", "--json"],
      options,
    );
    expect(removed.code, removed.stderr).toBe(0);
    expect(JSON.parse(removed.stdout)).toMatchObject({ job: { tags: ["reject"] } });

    const shown = await runCli(["history", "show", "abcd", "--json"], options);
    expect(shown.code, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({
      ok: true,
      run_manifest: { runs: [{ job_id: job.job_id }] },
      verify: { files: 1, checks_failed: 0 },
      outputs_abs: [path.join(job.output_dir, "image.png")],
    });

    const opened = await runCli(["history", "open", "abcd", "--json"], options);
    expect(opened.code, opened.stderr).toBe(0);
    expect(JSON.parse(opened.stdout)).toMatchObject({ ok: true, output_dir: job.output_dir });

    const listed = await runCli(["history", "list", "--json"], options);
    expect(listed.code, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject({
      ok: true,
      scopes: ["local"],
      total: 1,
      jobs: [{ outputs_abs: [path.join(job.output_dir, "image.png")] }],
    });

    const persisted = JSON.parse(
      await fs.readFile(path.join(tmp.workdir, "jobs", `${job.job_id}.json`), "utf-8"),
    );
    expect(persisted).toMatchObject({
      version: 2,
      notes: [{ text: "keep this" }],
      tags: ["reject"],
      reject_reason: "identity drift",
    });
  });
});
