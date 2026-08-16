import path from "node:path";
import { promises as fs } from "node:fs";
import { ComfyClient } from "../api/client.js";
import { getHistoryEntry, judgeHistory } from "../api/history.js";
import { ComfyProgressChannel, type ProgressEventRecord } from "../api/progress.js";
import { t } from "../i18n/index.js";
import { CliError, isCliError, type ErrorDetails } from "../io/errors.js";
import { extractOutputFiles, type OutputFileRef } from "../output/provider.js";
import { createPollWaker, sleep, type PollWaker } from "../utils/time.js";
import { upsertRunManifest } from "./manifest.js";
import type { JobPatch } from "./store.js";
import type { JobOutput, JobRecord } from "./types.js";

export type WaitForHistoryOptions = {
  pollIntervalMs: number;
  timeoutSeconds: number;
  detectLost?: boolean;
  onRunning?: () => void;
  waker?: PollWaker;
};

export type AwaitAndDownloadStore = {
  update: (patch: JobPatch) => Promise<void>;
};

export type AwaitAndDownloadOptions = {
  pollIntervalMs: number;
  timeoutSeconds: number;
  resume: boolean;
  onProgress?: (event: ProgressEventRecord) => void;
  onWarning?: (message: string) => void;
  store: AwaitAndDownloadStore;
};

const queueContainsPrompt = (queue: unknown, promptId: string) => {
  if (!queue || typeof queue !== "object") return false;
  const record = queue as Record<string, unknown>;
  for (const key of ["queue_running", "queue_pending"]) {
    const entries = record[key];
    if (!Array.isArray(entries)) continue;
    if (
      entries.some(
        (entry) => Array.isArray(entry) && entry.length > 1 && String(entry[1]) === promptId,
      )
    ) {
      return true;
    }
  }
  return false;
};

export const waitForHistory = async (
  client: ComfyClient,
  promptId: string,
  options: WaitForHistoryOptions,
): Promise<{ entry: Record<string, unknown>; outputs: OutputFileRef[] }> => {
  const { pollIntervalMs, timeoutSeconds, detectLost, onRunning, waker } = options;
  const start = Date.now();
  let emptyPolls = 0;

  while (true) {
    const history = await client.history(promptId);
    const entry = getHistoryEntry(history, promptId);
    const verdict = judgeHistory(history, promptId);
    if (verdict.state === "failed") {
      const outputs = extractOutputFiles(verdict.entry);
      const { failure } = verdict;
      const message =
        failure.kind === "interrupted"
          ? t("run.execution_interrupted", { node: failure.node_id ?? "-" })
          : t("run.execution_failed", {
              node: failure.node_id ?? "-",
              type: failure.node_type ?? "-",
              message: failure.exception_message ?? "-",
            });
      throw new CliError("EXECUTION_FAILED", message, 3, {
        prompt_id: promptId,
        ...failure,
        partial_outputs: outputs.length,
      });
    }
    if (verdict.state === "success") {
      const outputs = extractOutputFiles(verdict.entry);
      if (outputs.length === 0) {
        throw new CliError("NO_OUTPUTS", t("run.no_outputs"), 2, { prompt_id: promptId });
      }
      return { entry: verdict.entry, outputs };
    }

    if (entry) {
      emptyPolls = 0;
      onRunning?.();
    } else if (detectLost) {
      emptyPolls += 1;
      if (emptyPolls === 1 || (emptyPolls - 1) % 10 === 0) {
        const queue = await client.queue();
        if (!queueContainsPrompt(queue, promptId)) {
          throw new CliError("JOB_LOST", t("jobs.lost"), 3, {
            prompt_id: promptId,
            base_url: client.baseUrl,
          });
        }
      }
    }

    if (Date.now() - start > timeoutSeconds * 1000) {
      throw new CliError("TIMEOUT", t("run.timeout"), 3, { prompt_id: promptId });
    }
    await (waker ? waker.wait(pollIntervalMs) : sleep(pollIntervalMs));
  }
};

export const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const downloadOutputs = async (
  client: ComfyClient,
  outputs: OutputFileRef[],
  options: { outputDir: string; seed: number | null; runIndex: number },
): Promise<JobOutput[]> => {
  await fs.mkdir(options.outputDir, { recursive: true });
  const downloaded: JobOutput[] = [];
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index];
    const buffer = await client.viewFile(output);
    const ext = path.extname(output.filename) || ".png";
    const safeBase = safeFilename(path.basename(output.filename, ext));
    const seedSuffix = options.seed === null ? "seed" : String(options.seed);
    const savedTo = `${safeBase}_${seedSuffix}_${options.runIndex}_${index + 1}${ext}`;
    await fs.writeFile(path.join(options.outputDir, savedTo), buffer);
    downloaded.push({
      filename: output.filename,
      ...(output.subfolder === undefined ? {} : { subfolder: output.subfolder }),
      ...(output.type === undefined ? {} : { type: output.type }),
      ...(output.kind === undefined ? {} : { kind: output.kind }),
      saved_to: savedTo,
    });
  }
  return downloaded;
};

export const submitPrompt = async (
  client: ComfyClient,
  workflow: Record<string, unknown>,
  options: { clientId: string; promptId: string },
) => {
  const response = await client.prompt(workflow, options);
  return response.prompt_id ?? options.promptId;
};

const asErrorDetails = (details: unknown): ErrorDetails => {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    return details as ErrorDetails;
  }
  return details === undefined ? {} : { recorded_details: details };
};

const withJobContext = (error: CliError, job: JobRecord, baseUrl: string) => {
  if (error.code === "JOB_LOST") {
    error.details = {
      ...asErrorDetails(error.details),
      job_id: job.job_id,
      prompt_id: job.prompt_id,
      base_url: baseUrl,
      recorded_base_url: job.base_url,
      hint: t("jobs.lost_hint"),
    };
  } else if (error.code === "EXECUTION_FAILED" || error.code === "NO_OUTPUTS") {
    error.details = {
      ...asErrorDetails(error.details),
      run_index: job.batch_index,
      output_dir: job.output_dir,
    };
  }
  return error;
};

const recordError = (error: unknown): NonNullable<JobRecord["error"]> => {
  if (isCliError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  return { code: "UNEXPECTED", message: error instanceof Error ? error.message : String(error) };
};

export const awaitAndDownload = async (
  client: ComfyClient,
  job: JobRecord,
  options: AwaitAndDownloadOptions,
): Promise<{
  outputs: JobOutput[];
  duration_ms: number;
  progress_events: ProgressEventRecord[];
}> => {
  const started = Date.now();
  const progressEvents: ProgressEventRecord[] = [];
  const waker = createPollWaker();
  let runningMarked = job.status === "running" || job.started_at !== undefined;
  let acceptsRunningUpdate = true;
  let runningUpdate: Promise<void> = Promise.resolve();
  let runningUpdateError: unknown;

  const markRunning = () => {
    if (!acceptsRunningUpdate || runningMarked) return;
    runningMarked = true;
    runningUpdate = options.store
      .update({
        status: "running",
        started_at: new Date().toISOString(),
      })
      .catch((error: unknown) => {
        runningUpdateError = error;
      });
  };

  const finishRunningUpdate = async () => {
    await runningUpdate;
    if (runningUpdateError) throw runningUpdateError;
  };

  const channel = new ComfyProgressChannel(
    client.baseUrl,
    (event) => {
      progressEvents.push(event);
      options.onProgress?.(event);
      if (event.kind === "execution_start" || event.kind === "executing") markRunning();
      if (event.kind === "execution_error" || event.kind === "execution_interrupted") {
        waker.wake();
      }
    },
    { targetPromptId: job.prompt_id, clientId: job.client_id },
  );

  channel.start();
  try {
    let historyResult: Awaited<ReturnType<typeof waitForHistory>>;
    try {
      historyResult = await waitForHistory(client, job.prompt_id, {
        pollIntervalMs: options.pollIntervalMs,
        timeoutSeconds: options.timeoutSeconds,
        detectLost: options.resume,
        onRunning: markRunning,
        waker,
      });
      acceptsRunningUpdate = false;
      await finishRunningUpdate();
    } catch (caught) {
      acceptsRunningUpdate = false;
      await finishRunningUpdate();
      const error = isCliError(caught) ? withJobContext(caught, job, client.baseUrl) : caught;
      if (isCliError(error) && (error.code === "EXECUTION_FAILED" || error.code === "NO_OUTPUTS")) {
        await options.store.update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error: recordError(error),
        });
      } else if (isCliError(error) && error.code === "JOB_LOST") {
        await options.store.update({
          status: "lost",
          completed_at: new Date().toISOString(),
          error: recordError(error),
        });
      }
      throw error;
    }

    const outputs = await downloadOutputs(client, historyResult.outputs, {
      outputDir: job.output_dir,
      seed: job.seed,
      runIndex: job.batch_index,
    });
    const durationMs = Date.now() - started;
    await options.store.update({
      status: "completed",
      completed_at: new Date().toISOString(),
      outputs,
      duration_ms: durationMs,
      error: undefined,
    });

    const manifest = await upsertRunManifest(
      job.output_dir,
      {
        preset: job.preset,
        source: job.source,
        base_url: client.baseUrl,
        scope: job.scope,
        params: job.params,
        uploads: job.uploads,
      },
      {
        index: job.batch_index,
        job_id: job.job_id,
        prompt_id: job.prompt_id,
        status: "completed",
        seed: job.seed,
        duration_ms: durationMs,
        outputs,
      },
    );
    if (!manifest.ok) options.onWarning?.(manifest.error.message);

    return { outputs, duration_ms: durationMs, progress_events: progressEvents };
  } finally {
    channel.stop();
  }
};
