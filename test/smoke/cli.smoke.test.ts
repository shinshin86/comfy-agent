import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { startMockComfy, type RequestLog } from "../helpers/mock-comfyui.js";
import { runCli, type RunCliResult } from "../helpers/run-cli.js";
import { createTmpWorkdir, type TmpWorkdir } from "../helpers/tmp-workdir.js";

type MockServer = Awaited<ReturnType<typeof startMockComfy>>;
type JsonObject = Record<string, unknown>;

const WORKFLOW_FIXTURE = fileURLToPath(
  new URL("../helpers/fixtures/smoke-workflow-api.json", import.meta.url),
);
const OBJECT_INFO_FIXTURE = new URL("../helpers/fixtures/object-info.min.json", import.meta.url);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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

const cliOptions = (workdir: TmpWorkdir, baseUrl: string) => ({
  cwd: workdir.cwd,
  env: { HOME: workdir.home, USERPROFILE: workdir.home, COMFY_AGENT_BASE_URL: baseUrl },
});

const parseJson = (result: RunCliResult) => JSON.parse(result.stdout) as JsonObject;

const initWorkdir = async (workdir: TmpWorkdir, baseUrl: string) => {
  const result = await runCli(["init", "--force"], cliOptions(workdir, baseUrl));
  expect(result.code, result.stderr).toBe(0);
};

const importSmokePreset = async (workdir: TmpWorkdir, server: MockServer) => {
  await initWorkdir(workdir, server.baseUrl);
  const result = await runCli(
    ["import", WORKFLOW_FIXTURE, "--name", "smoke"],
    cliOptions(workdir, server.baseUrl),
  );
  expect(result.code, result.stderr).toBe(0);
};

const unusedBaseUrl = async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to reserve an unused port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return baseUrl;
};

const normalizedRequestPaths = (requests: RequestLog[]) =>
  requests.map((request) => (request.path.startsWith("/history/") ? "/history/:id" : request.path));

describe("mock ComfyUI CLI smoke", () => {
  it("1: doctor reports a reachable ComfyUI", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await initWorkdir(workdir, server.baseUrl);

    const result = await runCli(["doctor", "--json"], cliOptions(workdir, server.baseUrl));
    const payload = parseJson(result);

    expect(result.code, result.stderr).toBe(0);
    expect(payload.connection).toMatchObject({ ok: true });
    expect(payload.base_url_source).toBe("COMFY_AGENT_BASE_URL");
  });

  it("2: doctor reports an unreachable ComfyUI", async () => {
    const workdir = await createTmpWorkdir();
    const baseUrl = await unusedBaseUrl();
    await initWorkdir(workdir, baseUrl);

    const result = await runCli(["doctor", "--json"], cliOptions(workdir, baseUrl));
    const payload = parseJson(result);
    const connection = payload.connection as JsonObject;

    expect(result.code).toBe(3);
    expect(connection.error).toMatchObject({ code: "SERVER_UNREACHABLE" });
  });

  it("3: doctor preflight passes for an imported preset", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const result = await runCli(
      ["doctor", "--preset", "smoke", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);

    expect(result.code, result.stderr).toBe(0);
    expect(payload.preflight).toMatchObject({
      checked: true,
      missing_nodes: [],
      missing_models: [],
    });
  });

  it("4: doctor preflight reports a missing model", async () => {
    const objectInfo = JSON.parse(await fs.readFile(OBJECT_INFO_FIXTURE, "utf-8")) as JsonObject;
    const checkpoint = objectInfo.CheckpointLoaderSimple as JsonObject;
    const input = checkpoint.input as JsonObject;
    const required = input.required as JsonObject;
    required.ckpt_name = [["another-model.safetensors"]];
    const server = await startServer({ objectInfo });
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const result = await runCli(
      ["doctor", "--preset", "smoke", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);
    const preflight = payload.preflight as JsonObject;
    const missingModels = preflight.missing_models as JsonObject[];

    expect(result.code).toBe(3);
    expect(missingModels[0]?.value).toBe("v1-5-pruned-emaonly-fp16.safetensors");
  });

  it("5: run falls back to polling and saves the generated image", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    server.requests.length = 0;

    const result = await runCli(
      [
        "run",
        "smoke",
        "--source",
        "local",
        "--json",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "10",
      ],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);
    const runs = payload.runs as JsonObject[];
    const outputs = runs[0]?.outputs as JsonObject[];
    const savedTo = outputs[0]?.saved_to as string;
    const progressEvents = runs[0]?.progress_events as JsonObject[];

    expect(result.code, result.stderr).toBe(0);
    expect(payload.seed_targets).toEqual([{ param: "3_seed", matched_by: "role" }]);
    const [realSavedTo, realCwd] = await Promise.all([
      fs.realpath(savedTo),
      fs.realpath(workdir.cwd),
    ]);
    expect(realSavedTo.startsWith(`${realCwd}${path.sep}`)).toBe(true);
    const saved = await fs.readFile(savedTo);
    expect(saved.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    expect(progressEvents.map((event) => event.kind)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^channel_(lost|unavailable)$/)]),
    );
    expect(normalizedRequestPaths(server.requests)).toEqual([
      "/object_info",
      "/prompt",
      "/history/:id",
      "/history/:id",
      "/view",
    ]);
  });

  it("6: run reports a ComfyUI execution error", async () => {
    const server = await startServer({
      historyDelayPolls: 0,
      executionError: { node_id: "9", exception_message: "mock execution failed" },
    });
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const result = await runCli(
      [
        "run",
        "smoke",
        "--source",
        "local",
        "--json",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "1",
      ],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);
    const error = payload.error as JsonObject;

    expect(result.code).toBe(3);
    expect(error.code).toBe("EXECUTION_FAILED");
    expect(error.details).toMatchObject({
      node_id: "9",
      category: "unknown",
      kind: "error",
      partial_outputs: 0,
      run_index: 1,
      output_dir: expect.any(String),
    });
    expect(
      normalizedRequestPaths(server.requests).filter(
        (requestPath) => requestPath === "/history/:id",
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("7: run --async can be completed with jobs wait", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const submitted = await runCli(
      ["run", "smoke", "--source", "local", "--async", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const submittedPayload = parseJson(submitted);
    const submittedJobs = submittedPayload.jobs as JsonObject[];
    const jobId = submittedJobs[0]?.job_id as string;
    const jobPath = path.join(workdir.workdir, "jobs", `${jobId}.json`);

    expect(submitted.code, submitted.stderr).toBe(0);
    expect(submittedPayload).toMatchObject({ ok: true, async: true, scope: "local" });
    expect(JSON.parse(await fs.readFile(jobPath, "utf-8"))).toMatchObject({
      job_id: jobId,
      status: "submitted",
    });

    const waited = await runCli(
      ["jobs", "wait", jobId, "--json", "--poll-interval-ms", "50", "--timeout-seconds", "10"],
      cliOptions(workdir, server.baseUrl),
    );
    const waitedPayload = parseJson(waited);
    const waitedRuns = waitedPayload.runs as JsonObject[];
    const waitedOutputs = waitedRuns[0]?.outputs as JsonObject[];
    const savedTo = waitedOutputs[0]?.saved_to as string;

    expect(waited.code, waited.stderr).toBe(0);
    expect(waitedPayload).toMatchObject({
      ok: true,
      base_url_changed: false,
      jobs: [{ job_id: jobId, status: "completed" }],
    });
    await expect(fs.stat(savedTo)).resolves.toBeDefined();
    expect(JSON.parse(await fs.readFile(jobPath, "utf-8"))).toMatchObject({
      status: "completed",
      outputs: [{ saved_to: expect.any(String) }],
    });
    const manifest = JSON.parse(
      await fs.readFile(path.join(waitedPayload.output_dir as string, "run.json"), "utf-8"),
    ) as JsonObject;
    expect(manifest).toMatchObject({
      runs: [{ job_id: jobId, status: "completed", outputs: [{ saved_to: expect.any(String) }] }],
    });
  });

  it("8: jobs wait reports JOB_LOST when history is forgotten", async () => {
    const server = await startServer({ forgetHistory: true });
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const submitted = await runCli(
      ["run", "smoke", "--source", "local", "--async", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const submittedPayload = parseJson(submitted);
    const submittedJobs = submittedPayload.jobs as JsonObject[];
    const jobId = submittedJobs[0]?.job_id as string;
    const jobPath = path.join(workdir.workdir, "jobs", `${jobId}.json`);

    expect(submitted.code, submitted.stderr).toBe(0);
    const waited = await runCli(
      ["jobs", "wait", jobId, "--json", "--poll-interval-ms", "50"],
      cliOptions(workdir, server.baseUrl),
    );
    const waitedPayload = parseJson(waited);

    expect(waited.code).toBe(3);
    expect(waitedPayload.error).toMatchObject({
      code: "JOB_LOST",
      details: {
        job_id: jobId,
        prompt_id: jobId,
        hint: expect.any(String),
      },
    });
    expect(JSON.parse(await fs.readFile(jobPath, "utf-8"))).toMatchObject({
      status: "lost",
      error: { code: "JOB_LOST" },
    });
  });

  it("9: run reports SERVER_UNREACHABLE during preflight", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    const unreachable = await unusedBaseUrl();

    const result = await runCli(
      [
        "run",
        "smoke",
        "--source",
        "local",
        "--json",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "10",
        "--base-url",
        unreachable,
      ],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);
    const error = payload.error as JsonObject;

    expect(result.code).toBe(3);
    expect(error.code).toBe("SERVER_UNREACHABLE");
  });

  it("10: run rejects a stray positional before resolving the preset", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();

    const result = await runCli(
      ["run", "missing", "extra", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);

    expect(result.code).toBe(2);
    expect(payload.error).toMatchObject({
      code: "INVALID_USAGE",
      details: { unexpected: ["extra"] },
    });
    expect(server.requests).toEqual([]);
  });

  it("11: run --global reads the workflow from the global workdir", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    const options = cliOptions(workdir, server.baseUrl);

    const initResult = await runCli(["init", "--global", "--force"], options);
    expect(initResult.code, initResult.stderr).toBe(0);
    const importResult = await runCli(
      ["import", WORKFLOW_FIXTURE, "--name", "smoke-global", "--global"],
      options,
    );
    expect(importResult.code, importResult.stderr).toBe(0);

    const globalWorkflowPath = path.join(
      workdir.home,
      ".config",
      ".comfy-agent",
      "workflows",
      "smoke-global.json",
    );
    const localWorkflowPath = path.join(workdir.workdir, "workflows", "smoke-global.json");
    expect((await fs.stat(globalWorkflowPath)).isFile()).toBe(true);
    await expect(fs.stat(localWorkflowPath)).rejects.toMatchObject({ code: "ENOENT" });
    server.requests.length = 0;

    const result = await runCli(
      [
        "run",
        "smoke-global",
        "--global",
        "--source",
        "local",
        "--json",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "10",
      ],
      options,
    );
    const payload = parseJson(result);
    const runs = payload.runs as JsonObject[];

    expect(result.code, result.stderr).toBe(0);
    expect(runs).toHaveLength(1);
    expect(normalizedRequestPaths(server.requests)).toEqual([
      "/object_info",
      "/prompt",
      "/history/:id",
      "/history/:id",
      "/view",
    ]);
  });

  it("12: dry-run applies --seed to an imported preset seed parameter", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    server.requests.length = 0;

    const result = await runCli(
      ["run", "smoke", "--source", "local", "--json", "--dry-run", "--seed", "42"],
      cliOptions(workdir, server.baseUrl),
    );
    const workflow = parseJson(result);
    const sampler = workflow["3"] as JsonObject;
    const inputs = sampler.inputs as JsonObject;

    expect(result.code, result.stderr).toBe(0);
    expect(inputs.seed).toBe(42);

    const explicitResult = await runCli(
      ["run", "smoke", "--source", "local", "--json", "--dry-run", "--seed", "42", "--3_seed", "5"],
      cliOptions(workdir, server.baseUrl),
    );
    const explicitWorkflow = parseJson(explicitResult);
    const explicitSampler = explicitWorkflow["3"] as JsonObject;
    const explicitInputs = explicitSampler.inputs as JsonObject;

    expect(explicitResult.code, explicitResult.stderr).toBe(0);
    expect(explicitInputs.seed).toBe(5);
    expect(server.requests).toEqual([]);
  });

  it("13: generated --prompt matches the canonical imported parameter", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    server.requests.length = 0;

    const aliasResult = await runCli(
      ["run", "smoke", "--source", "local", "--dry-run", "--json", "--prompt", "hello"],
      cliOptions(workdir, server.baseUrl),
    );
    const canonicalResult = await runCli(
      ["run", "smoke", "--source", "local", "--dry-run", "--json", "--6_text", "hello"],
      cliOptions(workdir, server.baseUrl),
    );

    expect(aliasResult.code, aliasResult.stderr).toBe(0);
    expect(canonicalResult.code, canonicalResult.stderr).toBe(0);
    expect(parseJson(aliasResult)).toEqual(parseJson(canonicalResult));
    expect(server.requests).toEqual([]);
  });

  it("14: run reports success without output files as NO_OUTPUTS", async () => {
    const server = await startServer({ historyDelayPolls: 0, noOutputs: true });
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    server.requests.length = 0;

    const result = await runCli(
      [
        "run",
        "smoke",
        "--source",
        "local",
        "--json",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "1",
      ],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);
    const error = payload.error as JsonObject;

    expect(result.code).toBe(2);
    expect(error.code).toBe("NO_OUTPUTS");
    expect(error.details).toMatchObject({
      prompt_id: expect.any(String),
      run_index: 1,
      output_dir: expect.any(String),
    });
    expect(normalizedRequestPaths(server.requests)).toEqual([
      "/object_info",
      "/prompt",
      "/history/:id",
    ]);
  });

  it("15: run --async rejects an unwritable jobs path before submitting", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);
    await fs.writeFile(path.join(workdir.workdir, "jobs"), "blocked", "utf-8");
    server.requests.length = 0;

    const result = await runCli(
      ["run", "smoke", "--source", "local", "--async", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(result);

    expect(result.code).toBe(2);
    expect(payload.error).toMatchObject({ code: "WORKDIR_NOT_WRITABLE" });
    expect(normalizedRequestPaths(server.requests)).toEqual(["/object_info"]);
  });

  it("16: QuickStart works from connect without an explicit init", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await fs.rm(workdir.workdir, { recursive: true, force: true });
    await expect(fs.stat(workdir.workdir)).rejects.toMatchObject({ code: "ENOENT" });
    const options = {
      cwd: workdir.cwd,
      env: { HOME: workdir.home, USERPROFILE: workdir.home },
    };

    const connected = await runCli(["connect", server.baseUrl, "--json"], options);
    expect(connected.code, connected.stderr).toBe(0);
    expect(parseJson(connected)).toMatchObject({
      ok: true,
      base_url: server.baseUrl,
      connection: "OK",
      scope: "local",
    });

    const imported = await runCli(
      ["import", WORKFLOW_FIXTURE, "--name", "q", "--json"],
      options,
    );
    expect(imported.code, imported.stderr).toBe(0);
    expect(parseJson(imported)).toMatchObject({ ok: true, preset: "q" });

    const result = await runCli(
      ["run", "q", "--source", "local", "--json", "--poll-interval-ms", "50"],
      options,
    );
    const payload = parseJson(result);
    const runs = payload.runs as JsonObject[];

    expect(result.code, result.stderr).toBe(0);
    expect(payload).toMatchObject({ ok: true, preset: "q", source: "local" });
    expect(runs).toHaveLength(1);
  });

  it("17: run prompt fields are searchable through history", async () => {
    const server = await startServer();
    const workdir = await createTmpWorkdir();
    await importSmokePreset(workdir, server);

    const run = await runCli(
      [
        "run",
        "smoke",
        "--source",
        "local",
        "--json",
        "--prompt",
        "hello smoke",
        "--poll-interval-ms",
        "50",
        "--timeout-seconds",
        "10",
      ],
      cliOptions(workdir, server.baseUrl),
    );
    expect(run.code, run.stderr).toBe(0);

    const history = await runCli(
      ["history", "--search", "hello smoke", "--json"],
      cliOptions(workdir, server.baseUrl),
    );
    const payload = parseJson(history);
    const jobs = payload.jobs as JsonObject[];

    expect(history.code, history.stderr).toBe(0);
    expect(payload).toMatchObject({ ok: true, scopes: ["local"], total: 1 });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      preset: "smoke",
      prompt_input: "hello smoke",
      prompt_final: "hello smoke",
    });
  });
});
