import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { runCli } from "./helpers/run-cli.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const makeCompletedJob = (cwd: string): JobRecord => ({
  version: 1,
  job_id: "abcd1234-completed-job",
  prompt_id: "abcd1234-completed-job",
  client_id: "test-client",
  batch_id: "abcd1234-completed-job",
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "example",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: path.join(cwd, "outputs", "example"),
  submitted_at: "2000-01-01T00:00:00.000Z",
  completed_at: "2000-01-01T00:00:01.000Z",
  status: "completed",
  outputs: [],
  duration_ms: 1000,
});

describe("jobs CLI", () => {
  it("lists, shows, dry-runs pruning, and prunes local records", async () => {
    const tmp = await createTmpWorkdir();
    const job = makeCompletedJob(tmp.cwd);
    await writeJob(job, tmp.cwd, "local");
    const options = {
      cwd: tmp.cwd,
      env: {
        HOME: tmp.home,
        USERPROFILE: tmp.home,
        COMFY_AGENT_TEST_ENTRY: "tsx",
      },
    };

    const listed = await runCli(["jobs", "list", "--json"], options);
    expect(listed.code, listed.stderr).toBe(0);
    expect(JSON.parse(listed.stdout)).toEqual({ ok: true, scope: "local", jobs: [job] });

    const shown = await runCli(["jobs", "show", "abcd", "--json"], options);
    expect(shown.code, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toEqual({ ok: true, job });

    const dryRun = await runCli(
      ["jobs", "prune", "--older-than-days", "30", "--dry-run", "--json"],
      options,
    );
    expect(dryRun.code, dryRun.stderr).toBe(0);
    expect(JSON.parse(dryRun.stdout)).toEqual({
      ok: true,
      scope: "local",
      dry_run: true,
      pruned: [job.job_id],
    });

    const pruned = await runCli(["jobs", "prune", "--older-than-days", "30", "--json"], options);
    expect(pruned.code, pruned.stderr).toBe(0);
    expect(JSON.parse(pruned.stdout)).toEqual({
      ok: true,
      scope: "local",
      dry_run: false,
      pruned: [job.job_id],
    });
  });
});
