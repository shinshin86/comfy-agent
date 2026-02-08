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
import { normalizeWorkflow } from "../workflow/normalize.js";
import { applyParameters, applyUploads } from "../workflow/patch.js";
import { extractOutputFiles } from "../output/provider.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";
import { sleep } from "../utils/time.js";
import { ComfyProgressChannel, type ProgressEventRecord } from "../api/progress.js";
import { parseNumeric, resolveDynamicArgs, resolveSeedValues } from "./run/args.js";
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
  saved_to: string;
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

const loadWorkflow = async (preset: Preset) => {
  const workflowPath = path.join(getSubdirPath("workflows"), preset.workflow);
  const raw = await fs.readFile(workflowPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", t("run.invalid_workflow_json"), 2, {
      file: workflowPath,
      cause: String(err),
    });
  }

  try {
    return normalizeWorkflow(parsed);
  } catch (err) {
    throw new CliError("INVALID_WORKFLOW", (err as Error).message, 2, { file: workflowPath });
  }
};

const tryLoadLocalRunTarget = async (presetName: string, scope: "local" | "global") => {
  try {
    const presetPath = await resolvePresetPath(presetName, scope);
    const preset = await loadPresetFile(presetPath);
    const workflow = await loadWorkflow(preset);
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

const getOutputDir = async (
  presetName: string,
  outDir: string | undefined,
  scope: "local" | "global",
) => {
  if (outDir) {
    const resolved = path.resolve(outDir);
    await fs.mkdir(resolved, { recursive: true });
    return resolved;
  }
  const timestamp = formatTimestamp(new Date());
  const dir = path.join(getSubdirPath("outputs", process.cwd(), scope), presetName, timestamp);
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const formatTimestamp = (date: Date) => {
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const getHistoryEntry = (history: unknown, promptId: string) => {
  if (!history || typeof history !== "object") return null;
  const obj = history as Record<string, unknown>;
  if (promptId in obj) {
    return obj[promptId];
  }
  return history;
};

const waitForHistory = async (
  client: ComfyClient,
  promptId: string,
  pollIntervalMs: number,
  timeoutSeconds: number,
) => {
  const start = Date.now();
  while (true) {
    const history = await client.history(promptId);
    const entry = getHistoryEntry(history, promptId);
    const outputs = extractOutputFiles(entry);
    if (outputs.length > 0) {
      return { entry, outputs };
    }

    if (Date.now() - start > timeoutSeconds * 1000) {
      throw new CliError("TIMEOUT", t("run.timeout"), 3, {
        prompt_id: promptId,
      });
    }
    await sleep(pollIntervalMs);
  }
};

const formatProgressEvent = (event: ProgressEventRecord) => {
  if (event.kind === "channel_connected") return t("run.progress.channel_connected");
  if (event.kind === "channel_unavailable") return t("run.progress.channel_unavailable");
  if (event.kind === "channel_lost") return t("run.progress.channel_lost");
  if (event.kind === "execution_start") return t("run.progress.execution_start");
  if (event.kind === "execution_interrupted") return t("run.progress.execution_interrupted");
  if (event.kind === "execution_error") {
    return t("run.progress.execution_error", {
      node: event.node ?? "-",
      message: event.message ?? "-",
    });
  }
  if (event.kind === "execution_cached") {
    return t("run.progress.execution_cached", { node: event.node ?? "-" });
  }
  if (event.kind === "executing") {
    return t("run.progress.executing", { node: event.node ?? "-" });
  }
  if (event.kind === "executed") {
    return t("run.progress.executed", { node: event.node ?? "-" });
  }
  if (event.kind === "progress") {
    return t("run.progress.progress", {
      node: event.node ?? "-",
      value: event.value ?? 0,
      max: event.max ?? 0,
      percent: event.percent?.toFixed(2) ?? "-",
    });
  }
  return `progress: ${event.kind}`;
};

type ProgressUi = {
  onEvent: (event: ProgressEventRecord) => void;
  finish: () => void;
};

const createProgressUi = (enabled: boolean): ProgressUi => {
  if (!enabled) {
    return {
      onEvent: () => {},
      finish: () => {},
    };
  }

  if (!process.stderr.isTTY) {
    return {
      onEvent: (event) => {
        log(formatProgressEvent(event));
      },
      finish: () => {},
    };
  }

  let hasRendered = false;
  let latestNode = "-";

  const bar = (percent: number, width = 24) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
  };

  const draw = (line: string) => {
    process.stderr.write(`\r\x1b[2K${line}`);
    hasRendered = true;
  };

  const flushLine = () => {
    if (!hasRendered) return;
    process.stderr.write("\n");
    hasRendered = false;
  };

  return {
    onEvent: (event) => {
      if (event.node) {
        latestNode = event.node;
      }

      if (event.kind === "progress" && event.percent !== undefined) {
        draw(`Progress ${bar(event.percent)} ${event.percent.toFixed(1)}% (node: ${latestNode})`);
        return;
      }
      if (event.kind === "executing") {
        draw(`Progress running... (node: ${latestNode})`);
        return;
      }
      if (event.kind === "execution_start") {
        draw("Progress started...");
        return;
      }
      if (event.kind === "execution_cached") {
        draw(`Progress using cache... (node: ${latestNode})`);
        return;
      }

      if (
        event.kind === "channel_connected" ||
        event.kind === "channel_unavailable" ||
        event.kind === "channel_lost" ||
        event.kind === "execution_error" ||
        event.kind === "execution_interrupted" ||
        event.kind === "executed"
      ) {
        flushLine();
        log(formatProgressEvent(event));
      }
    },
    finish: () => {
      flushLine();
    },
  };
};

export const runRun = async (presetName: string, options: RunOptions, rawArgs: string[]) => {
  const scope = options.global ? "global" : "local";
  const scopeLabel = t(scope === "global" ? "scope.global" : "scope.local");
  await ensureWorkdir(scope);
  const baseUrl = resolveBaseUrl(options);
  const requestedSource = resolveRunSource(options.source);
  const client = new ComfyClient(baseUrl);

  const localTarget = await tryLoadLocalRunTarget(presetName, scope);
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

  const { params, uploads } = resolveDynamicArgs(rawArgs, preset);
  const seedValues = resolveSeedValues(preset, params, options, runCount);

  if (options.dryRun) {
    const seedValue = seedValues[0];
    if (seedValue !== null) {
      params.seed = seedValue;
    }
    const patched = applyParameters(workflow, preset, params);
    const withUploads = applyUploads(patched, preset, uploads);
    printJson(withUploads);
    return;
  }
  const outputDir = await getOutputDir(preset.name, options.out, scope);
  log(t("run.output_dir", { dir: outputDir }));

  const resolvedUploads: Record<string, string> = {};
  for (const [name, filePath] of Object.entries(uploads)) {
    await ensureFileExists(filePath);
    const def = preset.uploads?.[name];
    if (!def) continue;
    const endpoint = def.kind === "mask" ? "/upload/mask" : "/upload/image";
    log(t("run.upload", { name, endpoint }));
    const response = await client.uploadFile(endpoint, filePath);
    resolvedUploads[name] = resolveUploadPath(response);
  }

  const runs: RunResult[] = [];
  for (let i = 0; i < runCount; i += 1) {
    const runIndex = i + 1;
    const start = Date.now();
    const runParams = { ...params };
    const seedValue = seedValues[i];
    if (seedValue !== null) {
      runParams.seed = seedValue;
    }

    const patched = applyParameters(workflow, preset, runParams);
    const withUploads = applyUploads(patched, preset, resolvedUploads);

    const clientId = randomUUID();
    const requestPromptId = randomUUID();
    log(t("run.sending_prompt", { index: runIndex, count: runCount }));

    const progressEvents: ProgressEventRecord[] = [];
    const progressUi = createProgressUi(!options.json);
    let resolveChannelReady: (() => void) | null = null;
    const channelReady = new Promise<void>((resolve) => {
      resolveChannelReady = resolve;
    });
    const progressChannel = new ComfyProgressChannel(
      baseUrl,
      (event) => {
        progressEvents.push(event);
        if (
          event.kind === "channel_connected" ||
          event.kind === "channel_unavailable" ||
          event.kind === "channel_lost"
        ) {
          resolveChannelReady?.();
        }
        progressUi.onEvent(event);
      },
      { targetPromptId: requestPromptId, clientId },
    );
    progressChannel.start();
    await Promise.race([channelReady, sleep(500)]);

    const promptResponse = await client.prompt(withUploads, {
      clientId,
      promptId: requestPromptId,
    });
    const promptId = promptResponse.prompt_id ?? requestPromptId;
    if (!promptId) {
      progressChannel.stop();
      throw new CliError("API_ERROR", t("run.prompt_id_missing"), 3);
    }
    if (promptId !== requestPromptId) {
      progressChannel.setTargetPromptId(promptId);
    }

    let outputs: Array<{ filename: string; subfolder?: string; type?: string }> = [];
    try {
      const result = await waitForHistory(client, promptId, pollIntervalMs, timeoutSeconds);
      outputs = result.outputs;
    } finally {
      progressChannel.stop();
      progressUi.finish();
    }

    const outputFiles: OutputFile[] = [];
    for (let j = 0; j < outputs.length; j += 1) {
      const output = outputs[j];
      const buffer = await client.viewFile(output);
      const ext = path.extname(output.filename) || ".png";
      const safeBase = safeFilename(path.basename(output.filename, ext));
      const seedSuffix = seedValue !== null ? String(seedValue) : "seed";
      const fileName = `${safeBase}_${seedSuffix}_${runIndex}_${j + 1}${ext}`;
      const filePath = path.join(outputDir, fileName);
      await fs.writeFile(filePath, buffer);
      log(t("run.saved_file", { path: filePath }));
      outputFiles.push({
        filename: output.filename,
        subfolder: output.subfolder,
        type: output.type,
        saved_to: filePath,
      });
    }

    const durationMs = Date.now() - start;
    runs.push({
      index: runIndex,
      prompt_id: promptId,
      seed: seedValue,
      outputs: outputFiles,
      duration_ms: durationMs,
      progress_events: progressEvents,
    });
  }

  if (options.json) {
    printJson({
      ok: true,
      preset: preset.name,
      source: selectedSource,
      base_url: baseUrl,
      scope,
      output_dir: outputDir,
      runs,
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
