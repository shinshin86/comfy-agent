import path from "node:path";
import { ComfyClient } from "../api/client.js";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { log, print, printJson } from "../io/output.js";
import type { WorkdirScope } from "../io/workdir.js";
import { createProgressUi } from "../jobs/progress-ui.js";
import { listJobs, pruneJobs, readJob, updateJob } from "../jobs/store.js";
import { JobStatusSchema, type JobOutput, type JobRecord } from "../jobs/types.js";
import { awaitAndDownload } from "../jobs/wait.js";
import { resolveComfyBaseUrl } from "../utils/base-url.js";

type CommonOptions = {
  global?: boolean;
  json?: boolean;
};

export type JobsListOptions = CommonOptions & {
  status?: string;
  limit?: string;
};

export type JobsShowOptions = CommonOptions;

export type JobsWaitOptions = CommonOptions & {
  baseUrl?: string;
  pollIntervalMs?: string;
  timeoutSeconds?: string;
};

export type JobsPruneOptions = CommonOptions & {
  olderThanDays?: string;
  dryRun?: boolean;
};

const requestedScope = (options: CommonOptions): WorkdirScope =>
  options.global ? "global" : "local";

const parseIntegerAtLeastOne = (value: string | undefined, fallback: number, message: string) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CliError("INVALID_PARAM", message, 2, { value });
  }
  return parsed;
};

const parseNonNegativeNumber = (value: string | undefined, fallback: number, message: string) => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CliError("INVALID_PARAM", message, 2, { value });
  }
  return parsed;
};

const parseNonNegativeInteger = (value: string | undefined, fallback: number, message: string) => {
  const parsed = parseNonNegativeNumber(value, fallback, message);
  if (!Number.isInteger(parsed)) {
    throw new CliError("INVALID_PARAM", message, 2, { value });
  }
  return parsed;
};

const absoluteOutputs = (record: JobRecord): Array<JobOutput & { saved_to: string }> =>
  record.outputs.map((output) => ({
    ...output,
    saved_to: path.join(record.output_dir, output.saved_to),
  }));

const storedError = (record: JobRecord) => {
  const error = record.error ?? {
    code: record.status === "lost" ? "JOB_LOST" : "EXECUTION_FAILED",
    message:
      record.status === "lost"
        ? t("jobs.lost")
        : t("run.execution_failed", {
            node: "-",
            type: "-",
            message: "-",
          }),
  };
  const exitCode = error.code === "NO_OUTPUTS" ? 2 : 3;
  return new CliError(
    error.code,
    error.message,
    exitCode,
    error.details && typeof error.details === "object" && !Array.isArray(error.details)
      ? (error.details as Record<string, unknown>)
      : error.details === undefined
        ? undefined
        : { recorded_details: error.details },
  );
};

export const runJobsList = async (options: JobsListOptions) => {
  const scope = requestedScope(options);
  const statusResult =
    options.status === undefined ? null : JobStatusSchema.safeParse(options.status);
  if (statusResult?.success === false) {
    throw new CliError("INVALID_PARAM", t("jobs.invalid_status"), 2, {
      status: options.status,
    });
  }
  const limit = parseIntegerAtLeastOne(options.limit, 50, t("jobs.invalid_limit"));
  const jobs = await listJobs(process.cwd(), scope, {
    ...(statusResult?.success ? { status: statusResult.data } : {}),
    limit,
  });

  if (options.json) {
    printJson({ ok: true, scope, jobs });
    return;
  }

  if (jobs.length === 0) {
    print(t("jobs.list_empty"));
    return;
  }
  print("JOB      STATUS     PRESET  SUBMITTED                 OUTPUTS");
  for (const job of jobs) {
    const outputs = job.status === "submitted" ? "-" : String(job.outputs.length);
    print(
      `${job.job_id.slice(0, 8).padEnd(8)} ${job.status.padEnd(10)} ${job.preset.padEnd(7)} ${job.submitted_at.padEnd(25)} ${outputs}`,
    );
  }
};

export const runJobsShow = async (jobId: string, options: JobsShowOptions) => {
  const { record } = await readJob(jobId, process.cwd(), requestedScope(options));
  if (options.json) {
    printJson({ ok: true, job: record });
    return;
  }
  printJson(record);
};

export const runJobsWait = async (jobIds: string[], options: JobsWaitOptions) => {
  const scope = requestedScope(options);
  const baseUrl = resolveComfyBaseUrl(options);
  const pollIntervalMs = parseIntegerAtLeastOne(
    options.pollIntervalMs,
    1000,
    t("run.invalid_integer", { name: "poll-interval-ms" }),
  );
  const timeoutSeconds = parseNonNegativeInteger(
    options.timeoutSeconds,
    300,
    t("run.invalid_number", { name: "timeout-seconds" }),
  );
  const client = new ComfyClient(baseUrl);
  const runs: Array<Record<string, unknown>> = [];
  const jobs: Array<{ job_id: string; status: JobRecord["status"] }> = [];
  let firstRecord: JobRecord | undefined;
  let firstScope: WorkdirScope | undefined;
  let baseUrlChanged = false;
  let recordedBaseUrl: string | undefined;

  for (const jobId of jobIds) {
    const resolved = await readJob(jobId, process.cwd(), scope);
    const record = resolved.record;
    firstRecord ??= record;
    firstScope ??= resolved.scope;
    if (record.base_url !== client.baseUrl) {
      baseUrlChanged = true;
      recordedBaseUrl ??= record.base_url;
      log(
        t("jobs.base_url_changed", {
          recorded: record.base_url,
          current: client.baseUrl,
        }),
      );
    }

    if (record.status === "failed" || record.status === "lost") throw storedError(record);

    if (record.status === "completed") {
      runs.push({
        index: record.batch_index,
        prompt_id: record.prompt_id,
        seed: record.seed,
        outputs: absoluteOutputs(record),
        duration_ms: record.duration_ms ?? 0,
        progress_events: [],
        already_completed: true,
      });
      jobs.push({ job_id: record.job_id, status: "completed" });
      continue;
    }

    const progressUi = createProgressUi(!options.json);
    let completed: Awaited<ReturnType<typeof awaitAndDownload>>;
    try {
      completed = await awaitAndDownload(client, record, {
        pollIntervalMs,
        timeoutSeconds,
        resume: true,
        onProgress: progressUi.onEvent,
        onWarning: (message) => log(t("jobs.manifest_warning", { message })),
        store: {
          update: async (patch) => {
            await updateJob(record.job_id, patch, process.cwd(), resolved.scope);
          },
        },
      });
    } finally {
      progressUi.finish();
    }

    const outputs = completed.outputs.map((output) => ({
      ...output,
      saved_to: path.join(record.output_dir, output.saved_to),
    }));
    for (const output of outputs) log(t("run.saved_file", { path: output.saved_to }));
    runs.push({
      index: record.batch_index,
      prompt_id: record.prompt_id,
      seed: record.seed,
      outputs,
      duration_ms: completed.duration_ms,
      progress_events: completed.progress_events,
      already_completed: false,
    });
    jobs.push({ job_id: record.job_id, status: "completed" });
  }

  if (!firstRecord || !firstScope) {
    throw new CliError("INVALID_USAGE", t("cli.jobs.wait.arg.ids"), 2);
  }

  const payload = {
    ok: true,
    preset: firstRecord.preset,
    source: firstRecord.source,
    base_url: client.baseUrl,
    scope: firstScope,
    output_dir: firstRecord.output_dir,
    base_url_changed: baseUrlChanged,
    ...(recordedBaseUrl === undefined ? {} : { recorded_base_url: recordedBaseUrl }),
    runs,
    jobs,
  };

  if (options.json) {
    printJson(payload);
    return;
  }
  print(t("run.scope", { scope: firstScope }));
  print(t("run.source", { source: firstRecord.source }));
  print(t("run.completed", { dir: firstRecord.output_dir }));
  for (const run of runs) {
    print(
      `- #${String(run.index)} prompt_id=${String(run.prompt_id)} outputs=${(run.outputs as unknown[]).length}`,
    );
  }
};

export const runJobsPrune = async (options: JobsPruneOptions) => {
  const scope = requestedScope(options);
  const olderThanDays = parseNonNegativeNumber(
    options.olderThanDays,
    30,
    t("jobs.invalid_older_than_days"),
  );
  const dryRun = options.dryRun ?? false;
  const pruned = await pruneJobs(process.cwd(), scope, { olderThanDays, dryRun });
  if (options.json) {
    printJson({ ok: true, scope, dry_run: dryRun, pruned });
    return;
  }
  print(t("jobs.pruned_count", { count: pruned.length }));
  for (const jobId of pruned) print(`- ${jobId}`);
};
