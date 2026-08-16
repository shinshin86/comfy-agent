import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { ComfyClient } from "../api/client.js";
import { CliError } from "../io/errors.js";
import { log, print, printJson } from "../io/output.js";
import { t } from "../i18n/index.js";
import { getSubdirPath, getWorkdirPath } from "../io/workdir.js";
import { loadPresetFile } from "../preset/loader.js";
import type { Preset } from "../preset/schema.js";
import { resolvePresetPath } from "../preset/path.js";
import { loadLocalWorkflow } from "../workflow/load.js";
import { applyParameters, applyUploads } from "../workflow/patch.js";
import { assertPreflightPasses, fetchPreflightReport } from "../workflow/preflight.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";
import type { ProgressEventRecord } from "../api/progress.js";
import { createProgressUi } from "../jobs/progress-ui.js";
import { assertJobsDirWritable, updateJob, writeJob } from "../jobs/store.js";
import { upsertRunManifest } from "../jobs/manifest.js";
import type { JobOutput, JobRecord } from "../jobs/types.js";
import { awaitAndDownload, submitPrompt } from "../jobs/wait.js";
import {
  applySeedValue,
  parseArgv,
  parseNumeric,
  resolveDynamicArgs,
  resolveSeedTargets,
  resolveSeedValues,
} from "./run/args.js";
import { tryLoadRemoteCatalogRunTarget, tryLoadRemoteUserdataRunTarget } from "./run/remote.js";
import { resolveRunSource, resolveSelectedRunSource } from "./run/source.js";
import type { RunOptions } from "./run/types.js";

export type { RunOptions } from "./run/types.js";
export { resolveRunSource, resolveSelectedRunSource, selectRunSource } from "./run/source.js";
export {
  extractUserdataJsonCandidates,
  resolveRemoteWorkflow,
  tryLoadRemoteCatalogRunTarget,
  tryLoadRemoteRunTarget,
  tryLoadRemoteUserdataRunTarget,
} from "./run/remote.js";

type OutputFile = {
  filename: string;
  subfolder?: string;
  type?: string;
  kind?: string;
  saved_to: string;
};

type JobSummary = {
  job_id: string;
  prompt_id: string;
  batch_index: number;
  seed: number | null;
  status: JobRecord["status"];
  job_file?: string;
};

type RunResult = {
  index: number;
  prompt_id: string;
  seed: number | null;
  outputs: OutputFile[];
  duration_ms: number;
  progress_events: ProgressEventRecord[];
};

const ensureWorkdir = async (scope: "local" | "global") => {
  try {
    const stat = await fs.stat(getWorkdirPath(process.cwd(), scope));
    if (!stat.isDirectory()) {
      throw new CliError("WORKDIR_NOT_FOUND", t("run.workdir_missing"), 2);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("WORKDIR_NOT_FOUND", t("run.workdir_missing"), 2);
    }
    throw err;
  }
};

const tryLoadLocalRunTarget = async (
  presetName: string,
  scope: "local" | "global",
  client: ComfyClient,
) => {
  try {
    const presetPath = await resolvePresetPath(presetName, scope);
    const preset = await loadPresetFile(presetPath);
    const { workflow } = await loadLocalWorkflow(preset, scope, client);
    return { source: "local" as const, preset, workflow };
  } catch (err) {
    if (err instanceof CliError && err.code === "PRESET_NOT_FOUND") return null;
    throw err;
  }
};

const resolveBaseUrl = (options: RunOptions) => resolveComfyBaseUrl(options);

const ensureFileExists = async (filePath: string) => {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new CliError("FILE_NOT_FOUND", t("run.file_not_file", { path: filePath }), 2, {
        path: filePath,
      });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError("FILE_NOT_FOUND", t("run.file_not_found", { path: filePath }), 2, {
        path: filePath,
      });
    }
    throw err;
  }
};

const resolveUploadPath = (response: { name?: string; filename?: string; subfolder?: string }) => {
  const name = response.name ?? response.filename;
  if (!name) {
    throw new CliError("API_ERROR", t("run.upload_missing_filename"), 3, response);
  }
  if (response.subfolder) {
    return `${response.subfolder}/${name}`;
  }
  return name;
};

const uploadEndpointForKind = (kind: NonNullable<Preset["uploads"]>[string]["kind"]) => {
  if (kind === "mask") return "/upload/mask";
  return "/upload/image";
};

const getOutputDir = async (
  presetName: string,
  outDir: string | undefined,
  scope: "local" | "global",
  jobId: string,
) => {
  if (outDir) {
    const resolved = path.resolve(outDir);
    await fs.mkdir(resolved, { recursive: true });
    return resolved;
  }
  const timestamp = formatTimestamp(new Date());
  const dir = path.join(getSubdirPath("outputs", process.cwd(), scope), presetName, timestamp);
  await fs.mkdir(path.dirname(dir), { recursive: true });
  try {
    await fs.mkdir(dir);
    return dir;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const suffixed = `${dir}_${jobId.slice(0, 8)}`;
    await fs.mkdir(suffixed, { recursive: true });
    return suffixed;
  }
};

const formatTimestamp = (date: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

export const runRun = async (presetName: string, options: RunOptions, rawArgs: string[]) => {
  const { positionals } = parseArgv(rawArgs);
  if (positionals.length > 0) {
    throw new CliError(
      "INVALID_USAGE",
      t("run.unexpected_argument", { value: positionals[0] }),
      2,
      { unexpected: positionals },
    );
  }

  const scope = options.global ? "global" : "local";
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  await ensureWorkdir(scope);
  const baseUrl = resolveBaseUrl(options);
  const requestedSource = resolveRunSource(options.source);
  const client = new ComfyClient(baseUrl);

  const localTarget = await tryLoadLocalRunTarget(presetName, scope, client);
  let remoteTarget: Awaited<ReturnType<typeof tryLoadRemoteUserdataRunTarget>> | null = null;
  let remoteCatalogTarget: Awaited<ReturnType<typeof tryLoadRemoteCatalogRunTarget>> | null = null;
  let remoteError: unknown = null;
  let remoteCatalogError: unknown = null;

  if (requestedSource !== "local" && requestedSource !== "remote-catalog") {
    try {
      remoteTarget = await tryLoadRemoteUserdataRunTarget(presetName, client);
    } catch (err) {
      remoteError = err;
      if (requestedSource === "remote") throw err;
    }
  }
  if (requestedSource === "remote-catalog") {
    try {
      remoteCatalogTarget = await tryLoadRemoteCatalogRunTarget(presetName, client);
    } catch (err) {
      remoteCatalogError = err;
      throw err;
    }
  }

  const selectedSource = resolveSelectedRunSource(
    requestedSource,
    Boolean(localTarget),
    Boolean(remoteTarget),
    Boolean(remoteCatalogTarget),
    remoteError,
    remoteCatalogError,
  );
  const selectedTarget =
    selectedSource === "local"
      ? localTarget
      : selectedSource === "remote"
        ? remoteTarget
        : remoteCatalogTarget;
  if (!selectedTarget) {
    if (requestedSource !== "local" && requestedSource !== "remote-catalog" && remoteError)
      throw remoteError;
    if (requestedSource === "remote-catalog" && remoteCatalogError) throw remoteCatalogError;
    throw new CliError("PRESET_NOT_FOUND", t("run.preset_not_found"), 2);
  }
  const { preset, workflow } = selectedTarget;

  const runCount = options.n ? parseNumeric(options.n, "n", true) : 1;
  if (runCount < 1) {
    throw new CliError("INVALID_PARAM", t("run.n_min"), 2);
  }

  const pollIntervalMs = options.pollIntervalMs
    ? parseNumeric(options.pollIntervalMs, "poll-interval-ms", true)
    : 1000;
  const timeoutSeconds = options.timeoutSeconds
    ? parseNumeric(options.timeoutSeconds, "timeout-seconds", true)
    : 300;

  const { params, uploads, explicitParams } = resolveDynamicArgs(rawArgs, preset);
  const seedTargets = resolveSeedTargets(preset);
  const seedValues = resolveSeedValues(preset, params, options, runCount);
  const withSeedValue = (baseParams: Record<string, unknown>, seed: number) => {
    const seedableParams = { ...baseParams };
    for (const target of seedTargets) {
      if (!explicitParams.has(target.param)) delete seedableParams[target.param];
    }
    return applySeedValue(seedableParams, seedTargets, seed);
  };

  if (options.dryRun) {
    const seedValue = seedValues[0];
    const runParams = seedValue === null ? params : withSeedValue(params, seedValue);
    const patched = applyParameters(workflow, preset, runParams);
    const withUploads = applyUploads(patched, preset, uploads);
    printJson(withUploads);
    return;
  }
  if (options.preflight !== false) {
    const preflightTarget = applyParameters(workflow, preset, params);
    const report = await fetchPreflightReport(client, preflightTarget);
    assertPreflightPasses(report, baseUrl);
  }

  if (options.async) await assertJobsDirWritable(process.cwd(), scope);
  const requestPromptIds = Array.from({ length: runCount }, () => randomUUID());
  const outputDir = await getOutputDir(preset.name, options.out, scope, requestPromptIds[0]);
  log(t("run.output_dir", { dir: outputDir }));

  const resolvedUploads: Record<string, string> = {};
  for (const [name, filePath] of Object.entries(uploads)) {
    await ensureFileExists(filePath);
    const def = preset.uploads?.[name];
    if (!def) continue;
    const endpoint = uploadEndpointForKind(def.kind);
    log(t("run.upload", { name, endpoint }));
    const response = await client.uploadFile(endpoint, filePath);
    resolvedUploads[name] = resolveUploadPath(response);
  }

  const runs: RunResult[] = [];
  const jobSummaries: JobSummary[] = [];
  let batchId: string | null = null;
  for (let i = 0; i < runCount; i += 1) {
    const runIndex = i + 1;
    let runParams = { ...params };
    const seedValue = seedValues[i];
    if (seedValue !== null) {
      runParams = withSeedValue(runParams, seedValue);
    }

    const patched = applyParameters(workflow, preset, runParams);
    const withUploads = applyUploads(patched, preset, resolvedUploads);

    const clientId = randomUUID();
    const requestPromptId = requestPromptIds[i];
    log(t("run.sending_prompt", { index: runIndex, count: runCount }));
    const promptId = await submitPrompt(client, withUploads, {
      clientId,
      promptId: requestPromptId,
    });
    batchId ??= promptId;
    const job: JobRecord = {
      version: 1,
      job_id: promptId,
      prompt_id: promptId,
      client_id: clientId,
      batch_id: batchId,
      batch_index: runIndex,
      batch_count: runCount,
      scope,
      base_url: client.baseUrl,
      preset: preset.name,
      source: selectedSource,
      params: runParams,
      uploads: resolvedUploads,
      seed: seedValue,
      output_dir: outputDir,
      submitted_at: new Date().toISOString(),
      status: "submitted",
      outputs: [],
    };

    let jobFile: string | undefined;
    let recordStored = false;
    try {
      jobFile = await writeJob(job, process.cwd(), scope);
      recordStored = true;
    } catch (error) {
      if (options.async) throw error;
      const message = error instanceof Error ? error.message : String(error);
      log(t("jobs.record_write_warning", { message }));
    }
    log(t("jobs.submitted_job", { id: promptId, index: runIndex, count: runCount }));

    const summary: JobSummary = {
      job_id: promptId,
      prompt_id: promptId,
      batch_index: runIndex,
      seed: seedValue,
      status: "submitted",
      ...(jobFile === undefined ? {} : { job_file: jobFile }),
    };
    jobSummaries.push(summary);

    if (options.async) {
      const manifest = await upsertRunManifest(
        outputDir,
        {
          preset: preset.name,
          source: selectedSource,
          base_url: client.baseUrl,
          scope,
          params: runParams,
          uploads: resolvedUploads,
        },
        {
          index: runIndex,
          job_id: promptId,
          prompt_id: promptId,
          status: "submitted",
          seed: seedValue,
          outputs: [],
        },
      );
      if (!manifest.ok) log(t("jobs.manifest_warning", { message: manifest.error.message }));
      continue;
    }

    const progressUi = createProgressUi(!options.json);
    let completed: Awaited<ReturnType<typeof awaitAndDownload>>;
    try {
      completed = await awaitAndDownload(client, job, {
        pollIntervalMs,
        timeoutSeconds,
        resume: false,
        onProgress: progressUi.onEvent,
        onWarning: (message) => log(t("jobs.manifest_warning", { message })),
        store: {
          update: async (patch) => {
            if (!recordStored) return;
            await updateJob(promptId, patch, process.cwd(), scope);
          },
        },
      });
    } finally {
      progressUi.finish();
    }

    const outputFiles: OutputFile[] = completed.outputs.map((output: JobOutput) => ({
      filename: output.filename,
      ...(output.subfolder === undefined ? {} : { subfolder: output.subfolder }),
      ...(output.type === undefined ? {} : { type: output.type }),
      ...(output.kind === undefined ? {} : { kind: output.kind }),
      saved_to: path.join(outputDir, output.saved_to),
    }));
    for (const output of outputFiles) log(t("run.saved_file", { path: output.saved_to }));
    summary.status = "completed";
    runs.push({
      index: runIndex,
      prompt_id: promptId,
      seed: seedValue,
      outputs: outputFiles,
      duration_ms: completed.duration_ms,
      progress_events: completed.progress_events,
    });
  }

  if (options.async) {
    if (options.json) {
      printJson({
        ok: true,
        async: true,
        preset: preset.name,
        source: selectedSource,
        base_url: client.baseUrl,
        scope,
        output_dir: outputDir,
        jobs: jobSummaries,
      });
      return;
    }
    print(t("run.scope", { scope: scopeLabel }));
    print(t("run.source", { source: selectedSource }));
    print(t("jobs.submitted_count", { count: jobSummaries.length }));
    print(t("jobs.wait_hint", { ids: jobSummaries.map(({ job_id: id }) => id).join(" ") }));
    return;
  }

  if (options.json) {
    printJson({
      ok: true,
      preset: preset.name,
      source: selectedSource,
      base_url: client.baseUrl,
      scope,
      output_dir: outputDir,
      seed_targets: seedTargets,
      runs,
      jobs: jobSummaries,
    });
    return;
  }

  print(t("run.scope", { scope: scopeLabel }));
  print(t("run.source", { source: selectedSource }));
  print(t("run.completed", { dir: outputDir }));
  for (const run of runs) {
    print(`- #${run.index} prompt_id=${run.prompt_id} outputs=${run.outputs.length}`);
  }
};
