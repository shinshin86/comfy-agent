import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ComfyClient } from "../src/api/client.js";
import { readRunManifest } from "../src/jobs/manifest.js";
import { readJob, updateJob, writeJob } from "../src/jobs/store.js";
import type { JobRecord } from "../src/jobs/types.js";
import { awaitAndDownload } from "../src/jobs/wait.js";
import { startMockComfy } from "./helpers/mock-comfyui.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

type MockServer = Awaited<ReturnType<typeof startMockComfy>>;
const servers = new Set<MockServer>();

afterEach(async () => {
  await Promise.all([...servers].map((server) => server.close()));
  servers.clear();
});

const startServer = async (options?: Parameters<typeof startMockComfy>[0]) => {
  const server = await startMockComfy(options);
  servers.add(server);
  return server;
};

const submitTestJob = async (
  server: MockServer,
  cwd: string,
): Promise<{ client: ComfyClient; job: JobRecord }> => {
  const client = new ComfyClient(server.baseUrl);
  const promptId = randomUUID();
  const clientId = randomUUID();
  const response = await client.prompt({}, { clientId, promptId });
  const jobId = response.prompt_id ?? promptId;
  const job: JobRecord = {
    version: 1,
    job_id: jobId,
    prompt_id: jobId,
    client_id: clientId,
    batch_id: jobId,
    batch_index: 1,
    batch_count: 1,
    scope: "local",
    base_url: client.baseUrl,
    preset: "wait-test",
    source: "local",
    params: {},
    uploads: {},
    seed: null,
    output_dir: path.join(cwd, "outputs", jobId),
    submitted_at: new Date().toISOString(),
    status: "submitted",
    outputs: [],
  };
  await writeJob(job, cwd, "local");
  return { client, job };
};

const waitOptions = (job: JobRecord, cwd: string, resume: boolean, timeoutSeconds = 1) => ({
  pollIntervalMs: 5,
  timeoutSeconds,
  resume,
  store: {
    update: async (patch: Parameters<typeof updateJob>[1]) => {
      await updateJob(job.job_id, patch, cwd, "local");
    },
  },
});

describe("awaitAndDownload", () => {
  it("completes a job, downloads relative outputs, and projects run.json", async () => {
    const server = await startServer({ historyDelayPolls: 0 });
    const tmp = await createTmpWorkdir();
    const { client, job } = await submitTestJob(server, tmp.cwd);

    const result = await awaitAndDownload(client, job, waitOptions(job, tmp.cwd, true));
    expect(result.outputs).toHaveLength(1);
    expect(path.isAbsolute(result.outputs[0].saved_to)).toBe(false);
    await expect(
      fs.stat(path.join(job.output_dir, result.outputs[0].saved_to)),
    ).resolves.toBeDefined();

    const stored = await readJob(job.job_id, tmp.cwd, "local");
    expect(stored.record).toMatchObject({ status: "completed", outputs: result.outputs });
    await expect(readRunManifest(job.output_dir)).resolves.toMatchObject({
      ok: true,
      manifest: {
        runs: [{ job_id: job.job_id, status: "completed", outputs: result.outputs }],
      },
    });
  });

  it("marks a forgotten job as lost", async () => {
    const server = await startServer({ forgetHistory: true });
    const tmp = await createTmpWorkdir();
    const { client, job } = await submitTestJob(server, tmp.cwd);

    await expect(
      awaitAndDownload(client, job, waitOptions(job, tmp.cwd, true)),
    ).rejects.toMatchObject({ code: "JOB_LOST", exitCode: 3 });
    await expect(readJob(job.job_id, tmp.cwd, "local")).resolves.toMatchObject({
      record: { status: "lost", error: { code: "JOB_LOST" } },
    });
  });

  it("marks a ComfyUI execution error as failed", async () => {
    const server = await startServer({
      historyDelayPolls: 0,
      executionError: { node_id: "9", exception_message: "mock execution failed" },
    });
    const tmp = await createTmpWorkdir();
    const { client, job } = await submitTestJob(server, tmp.cwd);

    await expect(
      awaitAndDownload(client, job, waitOptions(job, tmp.cwd, true)),
    ).rejects.toMatchObject({ code: "EXECUTION_FAILED", exitCode: 3 });
    await expect(readJob(job.job_id, tmp.cwd, "local")).resolves.toMatchObject({
      record: { status: "failed", error: { code: "EXECUTION_FAILED" } },
    });
  });

  it("leaves job status unchanged on timeout", async () => {
    const server = await startServer({ historyDelayPolls: 100 });
    const tmp = await createTmpWorkdir();
    const { client, job } = await submitTestJob(server, tmp.cwd);

    await expect(
      awaitAndDownload(client, job, waitOptions(job, tmp.cwd, true, 0)),
    ).rejects.toMatchObject({ code: "TIMEOUT", exitCode: 3 });
    const stored = await readJob(job.job_id, tmp.cwd, "local");
    expect(stored.record.status).toBe("submitted");
    expect(stored.record.error).toBeUndefined();
  });

  it("does not query /queue when resume is false", async () => {
    const server = await startServer({ forgetHistory: true });
    const tmp = await createTmpWorkdir();
    const { client, job } = await submitTestJob(server, tmp.cwd);

    await expect(
      awaitAndDownload(client, job, waitOptions(job, tmp.cwd, false, 0)),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(server.requests.some(({ path: requestPath }) => requestPath === "/queue")).toBe(false);
  });
});
