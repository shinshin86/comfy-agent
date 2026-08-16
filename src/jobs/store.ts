import path from "node:path";
import { promises as fs } from "node:fs";
import { t } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { getJobsDirPath, type WorkdirScope } from "../io/workdir.js";
import {
  JobRecordSchema,
  type JobRecord,
  type JobStatus,
  type JobVerifySummary,
} from "./types.js";

export type ResolvedJob = {
  record: JobRecord;
  scope: WorkdirScope;
};

export type ListJobsOptions = {
  status?: JobStatus;
  limit?: number;
};

export type PruneJobsOptions = {
  olderThanDays: number;
  dryRun: boolean;
};

export type JobPatch = Partial<Omit<JobRecord, "version" | "job_id">>;

export type AttachVerifySummaryResult =
  | { status: "written" }
  | { status: "not_found" }
  | { status: "error"; error: unknown };

const V2_JOB_KEYS = new Set<keyof JobPatch>([
  "prompt_input",
  "prompt_final",
  "prompt_source",
  "negative_final",
  "character",
  "tags",
  "notes",
  "reject_reason",
  "verify",
  "favorite",
]);

type StoredJob = {
  path: string;
  record: JobRecord;
};

const otherScope = (scope: WorkdirScope): WorkdirScope => (scope === "local" ? "global" : "local");

const errorCause = (error: unknown) => (error instanceof Error ? error.message : String(error));

const workdirNotWritableError = (jobsDir: string, error: unknown) =>
  new CliError("WORKDIR_NOT_WRITABLE", t("jobs.workdir_not_writable", { path: jobsDir }), 2, {
    path: jobsDir,
    cause: errorCause(error),
  });

const invalidRecordError = (filePath: string, error: unknown) =>
  new CliError("INVALID_JOB_RECORD", t("jobs.invalid_record", { path: filePath }), 2, {
    path: filePath,
    cause: errorCause(error),
  });

const parseRecord = (value: unknown, filePath: string): JobRecord => {
  try {
    return JobRecordSchema.parse(value);
  } catch (error) {
    throw invalidRecordError(filePath, error);
  }
};

const readRecordFile = async (filePath: string): Promise<JobRecord> => {
  const raw = await fs.readFile(filePath, "utf-8");

  try {
    return parseRecord(JSON.parse(raw) as unknown, filePath);
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw invalidRecordError(filePath, error);
  }
};

const listRecordPaths = async (cwd: string, scope: WorkdirScope): Promise<string[]> => {
  const jobsDir = getJobsDirPath(cwd, scope);
  try {
    const entries = await fs.readdir(jobsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(jobsDir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

const loadScopeRecords = async (cwd: string, scope: WorkdirScope): Promise<StoredJob[]> => {
  const paths = await listRecordPaths(cwd, scope);
  return Promise.all(
    paths.map(async (filePath) => ({ path: filePath, record: await readRecordFile(filePath) })),
  );
};

const resolveRecordPath = async (
  jobId: string,
  cwd: string,
  scope: WorkdirScope,
): Promise<string | null> => {
  const recordPaths = await listRecordPaths(cwd, scope);
  const exactName = `${jobId}.json`;
  const exact = recordPaths.find((filePath) => path.basename(filePath) === exactName);
  if (exact) return exact;
  if (jobId.length < 4) return null;

  const matches = recordPaths.filter((filePath) =>
    path.basename(filePath, ".json").startsWith(jobId),
  );
  if (matches.length > 1) {
    throw new CliError("JOB_AMBIGUOUS_ID", t("jobs.ambiguous_id", { id: jobId }), 2, {
      job_id: jobId,
      scope,
      matches: matches.map((filePath) => path.basename(filePath, ".json")).sort(),
    });
  }
  return matches[0] ?? null;
};

const isSafeJobId = (jobId: string) =>
  jobId.length > 0 &&
  path.posix.basename(jobId) === jobId &&
  path.win32.basename(jobId) === jobId &&
  jobId !== "." &&
  jobId !== "..";

export const writeJob = async (
  record: JobRecord,
  cwd: string,
  scope: WorkdirScope,
): Promise<string> => {
  const jobsDir = getJobsDirPath(cwd, scope);
  const parsed = parseRecord(record, path.join(jobsDir, `${record.job_id}.json`));
  if (!isSafeJobId(parsed.job_id)) {
    throw invalidRecordError(path.join(jobsDir, "<job_id>.json"), "unsafe job_id");
  }

  const filePath = path.join(jobsDir, `${parsed.job_id}.json`);
  const tempPath = `${filePath}.tmp`;
  try {
    await fs.mkdir(jobsDir, { recursive: true });
    await fs.writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    await fs.rename(tempPath, filePath);
    return filePath;
  } catch (error) {
    throw workdirNotWritableError(jobsDir, error);
  }
};

export const assertJobsDirWritable = async (cwd: string, scope: WorkdirScope): Promise<void> => {
  const jobsDir = getJobsDirPath(cwd, scope);
  const probePath = path.join(jobsDir, `.write-test-${process.pid}-${Date.now()}`);
  try {
    await fs.mkdir(jobsDir, { recursive: true });
    const handle = await fs.open(probePath, "wx");
    await handle.close();
    await fs.unlink(probePath);
  } catch (error) {
    throw workdirNotWritableError(jobsDir, error);
  }
};

export const readJob = async (
  jobId: string,
  cwd: string,
  scope: WorkdirScope,
): Promise<ResolvedJob> => {
  for (const candidateScope of [scope, otherScope(scope)]) {
    const filePath = await resolveRecordPath(jobId, cwd, candidateScope);
    if (filePath) {
      return { record: await readRecordFile(filePath), scope: candidateScope };
    }
  }

  throw new CliError("JOB_NOT_FOUND", t("jobs.not_found", { id: jobId }), 2, {
    job_id: jobId,
    scope,
  });
};

export const updateJob = async (
  jobId: string,
  patch: JobPatch,
  cwd: string,
  scope: WorkdirScope,
): Promise<ResolvedJob> => {
  const resolved = await readJob(jobId, cwd, scope);
  const version = Object.keys(patch).some((key) => V2_JOB_KEYS.has(key as keyof JobPatch))
    ? 2
    : resolved.record.version;
  const record = parseRecord(
    {
      ...resolved.record,
      ...patch,
      version,
      job_id: resolved.record.job_id,
      scope: resolved.scope,
    },
    path.join(getJobsDirPath(cwd, resolved.scope), `${resolved.record.job_id}.json`),
  );
  await writeJob(record, cwd, resolved.scope);
  return { record, scope: resolved.scope };
};

export const attachVerifySummary = async (
  jobId: string,
  summary: JobVerifySummary,
  options: { cwd: string; scope: WorkdirScope },
): Promise<AttachVerifySummaryResult> => {
  try {
    const resolved = await readJob(jobId, options.cwd, options.scope);
    await updateJob(resolved.record.job_id, { verify: summary }, options.cwd, resolved.scope);
    return { status: "written" };
  } catch (error) {
    if (error instanceof CliError && error.code === "JOB_NOT_FOUND") {
      return { status: "not_found" };
    }
    return { status: "error", error };
  }
};

export const listJobs = async (
  cwd: string,
  scope: WorkdirScope,
  options: ListJobsOptions = {},
): Promise<JobRecord[]> => {
  const stored = await loadScopeRecords(cwd, scope);
  const records = stored
    .map(({ record }) => record)
    .filter((record) => options.status === undefined || record.status === options.status)
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at));

  if (options.limit === undefined) return records;
  return records.slice(0, Math.max(0, Math.floor(options.limit)));
};

const TERMINAL_STATUSES = new Set<JobStatus>(["completed", "failed", "lost"]);

export const pruneJobs = async (
  cwd: string,
  scope: WorkdirScope,
  options: PruneJobsOptions,
): Promise<string[]> => {
  const cutoff = Date.now() - options.olderThanDays * 24 * 60 * 60 * 1000;
  const stored = await loadScopeRecords(cwd, scope);
  const selected = stored.filter(({ record }) => {
    if (!TERMINAL_STATUSES.has(record.status)) return false;
    const timestamp = Date.parse(record.completed_at ?? record.submitted_at);
    return Number.isFinite(timestamp) && timestamp < cutoff;
  });

  if (!options.dryRun) {
    await Promise.all(selected.map(({ path: filePath }) => fs.unlink(filePath)));
  }

  return selected.map(({ record }) => record.job_id);
};
