import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import type { JobRecord } from "../src/jobs/types.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const loadStore = () => import("../src/jobs/store.js");

const makeJob = (cwd: string, jobId: string, overrides: Partial<JobRecord> = {}): JobRecord => ({
  version: 1,
  job_id: jobId,
  prompt_id: jobId,
  client_id: `client-${jobId}`,
  batch_id: jobId,
  batch_index: 1,
  batch_count: 1,
  scope: "local",
  base_url: "http://127.0.0.1:8188",
  preset: "example",
  source: "local",
  params: {},
  uploads: {},
  seed: null,
  output_dir: path.join(cwd, "outputs", jobId),
  submitted_at: "2026-08-16T00:00:00.000Z",
  status: "submitted",
  outputs: [],
  ...overrides,
});

describe("job store", () => {
  it("writes atomically and reads exact and prefix IDs", async () => {
    const tmp = await createTmpWorkdir();
    const { readJob, writeJob } = await loadStore();
    const job = makeJob(tmp.cwd, "abcd1234-job");
    const filePath = await writeJob(job, tmp.cwd, "local");

    await expect(fs.stat(filePath)).resolves.toBeDefined();
    await expect(fs.stat(`${filePath}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readJob(job.job_id, tmp.cwd, "local")).resolves.toEqual({
      record: job,
      scope: "local",
    });
    await expect(readJob("abcd", tmp.cwd, "local")).resolves.toEqual({
      record: job,
      scope: "local",
    });
  });

  it("rejects ambiguous prefixes and reports missing IDs", async () => {
    const tmp = await createTmpWorkdir();
    const { readJob, writeJob } = await loadStore();
    await writeJob(makeJob(tmp.cwd, "same-one"), tmp.cwd, "local");
    await writeJob(makeJob(tmp.cwd, "same-two"), tmp.cwd, "local");

    await expect(readJob("same", tmp.cwd, "local")).rejects.toMatchObject({
      code: "JOB_AMBIGUOUS_ID",
      exitCode: 2,
    });
    await expect(readJob("missing-job-id", tmp.cwd, "local")).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
      exitCode: 2,
    });
    await expect(readJob("sam", tmp.cwd, "local")).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
    });
  });

  it("falls back to the other scope and returns the resolved scope", async () => {
    const tmp = await createTmpWorkdir();
    const { readJob, writeJob } = await loadStore();
    const job = makeJob(tmp.cwd, "scope-fallback-unique-job");
    await writeJob(job, tmp.cwd, "local");

    await expect(readJob(job.job_id, tmp.cwd, "global")).resolves.toEqual({
      record: job,
      scope: "local",
    });
  });

  it("updates a resolved record in place", async () => {
    const tmp = await createTmpWorkdir();
    const { updateJob, writeJob } = await loadStore();
    const job = makeJob(tmp.cwd, "update-job");
    await writeJob(job, tmp.cwd, "local");

    const result = await updateJob(
      job.job_id,
      { status: "running", started_at: "2026-08-16T00:00:01.000Z" },
      tmp.cwd,
      "local",
    );
    expect(result.record).toMatchObject({
      job_id: job.job_id,
      status: "running",
      started_at: "2026-08-16T00:00:01.000Z",
    });
  });

  it("lists records newest-first and supports filters and limits", async () => {
    const tmp = await createTmpWorkdir();
    const { listJobs, writeJob } = await loadStore();
    const older = makeJob(tmp.cwd, "older-job", {
      submitted_at: "2026-08-14T00:00:00.000Z",
      status: "completed",
    });
    const newer = makeJob(tmp.cwd, "newer-job", {
      submitted_at: "2026-08-16T00:00:00.000Z",
      status: "running",
    });
    const newest = makeJob(tmp.cwd, "newest-job", {
      submitted_at: "2026-08-17T00:00:00.000Z",
      status: "completed",
    });
    await Promise.all([older, newer, newest].map((job) => writeJob(job, tmp.cwd, "local")));

    expect((await listJobs(tmp.cwd, "local")).map(({ job_id: id }) => id)).toEqual([
      newest.job_id,
      newer.job_id,
      older.job_id,
    ]);
    expect(
      (await listJobs(tmp.cwd, "local", { status: "completed", limit: 1 })).map(
        ({ job_id: id }) => id,
      ),
    ).toEqual([newest.job_id]);
  });

  it("dry-runs pruning terminal records without deleting them", async () => {
    const tmp = await createTmpWorkdir();
    const { listJobs, pruneJobs, writeJob } = await loadStore();
    const oldCompleted = makeJob(tmp.cwd, "old-completed", {
      status: "completed",
      completed_at: "2000-01-01T00:00:00.000Z",
    });
    const oldFailed = makeJob(tmp.cwd, "old-failed", {
      status: "failed",
      completed_at: "2000-01-02T00:00:00.000Z",
    });
    const oldRunning = makeJob(tmp.cwd, "old-running", {
      status: "running",
      submitted_at: "2000-01-01T00:00:00.000Z",
    });
    await Promise.all(
      [oldCompleted, oldFailed, oldRunning].map((job) => writeJob(job, tmp.cwd, "local")),
    );

    expect((await pruneJobs(tmp.cwd, "local", { olderThanDays: 30, dryRun: true })).sort()).toEqual(
      [oldCompleted.job_id, oldFailed.job_id].sort(),
    );
    expect(await listJobs(tmp.cwd, "local")).toHaveLength(3);

    await pruneJobs(tmp.cwd, "local", { olderThanDays: 30, dryRun: false });
    expect((await listJobs(tmp.cwd, "local")).map(({ job_id: id }) => id)).toEqual([
      oldRunning.job_id,
    ]);
  });

  it("maps invalid records and unwritable job directories to CliError", async () => {
    const invalidTmp = await createTmpWorkdir();
    const { readJob, writeJob } = await loadStore();
    const invalidPath = path.join(invalidTmp.workdir, "jobs", "invalid.json");
    await fs.mkdir(path.dirname(invalidPath), { recursive: true });
    await fs.writeFile(invalidPath, "{not-json", "utf-8");
    await expect(readJob("invalid", invalidTmp.cwd, "local")).rejects.toMatchObject({
      code: "INVALID_JOB_RECORD",
      exitCode: 2,
    });

    const blockedTmp = await createTmpWorkdir();
    const jobsDir = path.join(blockedTmp.workdir, "jobs");
    await fs.writeFile(jobsDir, "blocked", "utf-8");
    await expect(
      writeJob(makeJob(blockedTmp.cwd, "blocked-job"), blockedTmp.cwd, "local"),
    ).rejects.toMatchObject({ code: "WORKDIR_NOT_WRITABLE", exitCode: 2 });
  });
});
